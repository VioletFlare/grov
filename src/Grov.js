//Sometimes crashes with a cryptic numeric error during debug (on nodev16): "Process exited with code 3221225477"
//to resolve:
//$ npm run clean 

const Discord = require("discord.js");
const ytdl = require("discord-ytdl-core");
const ytpl = require('ytpl');
const ytmpl = require('../lib/yt-mix-playlist');
const yts = require('yt-search');
const keepAlive = require('../server.js');
const Readable = require("stream").Readable;
const youtubeify = require('../lib/youtubeify');

if (process.env['REPLIT']) {
  (async () => keepAlive())();
}

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xF8, 0xFF, 0xFE]));
  }
}

class Grov {
  constructor(guild) {
    this.guild = guild;
    this.prefix = "gr";
    this.queue = new Map();
    this.githubPage = "https://github.com/VioletFlare/grov";
  }

  timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _playEmptyFrame() {
    const emptyFrame = new Silence();
    this.connection.play(emptyFrame);
  }

  _connectToVoice(msg) {
    const channelID = msg.member.voice.channelID;
    const channel = this.guild.channels.cache.get(channelID);

    if (!channelID) {
      return msg.channel.send("To invite me, enter the voice chat first.");
    }

    const permissions = channel.permissionsFor(msg.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
      return msg.channel.send(
        "I need permission to connect to this voice chat."
      );
    } else if (!channel) {
      return console.error("The channel does not exist!");
    } else {
      const isAlreadyConnectedToVoice = this.guild.voice?.connections?.size;

      if (isAlreadyConnectedToVoice) {
        this._chooseProvider(this.srcURL);
      } else {
        channel.join().then(connection => {
          this.connection = connection;
          this._playEmptyFrame(); // playing silence to patch voice bug 
          this._chooseProvider(this.srcURL);
          console.log("Successfully connected.");
        }).catch(e => {
          console.error(e);
        });
      }

    }

  }

  _disconnectFromVoice(msg) {
    if(!msg.guild.me.voice.channel) return msg.channel.send("I am not in a channel.");

    msg.guild.me.voice.channel.leave();
  }

  _skip() {
    this.dispatcher.emit("finish");
  }

  _sendSongTitle(song) {
    ytdl.getBasicInfo(song).then(async info => {
      const embed = new Discord.MessageEmbed()
      .setColor('#000000')
      .setTitle(`🔊   ${info.videoDetails.title}`)
      .setURL(song);
    
      if (this.songTitleMessage) {
        this.songTitleMessage.edit(embed);
      } else {
        this.songTitleMessage = await this.serverQueue.textChannel.send(embed);
      }

    });
  }

  _handleYoutube403() {
    //Trying to play the failed song after waiting a while.
    console.log("Playback failed, retrying...");

    this.timeout(250).then(
      () => this._play()
    )
  }

  _handleGoogleConnectionRefused() {
    console.log("Connection refused, retrying...");

    this.timeout(1000).then(
      () => this._play()
    )
  }

  _handlePlayError(error) {
    console.log("Error caught in the voice connection.");
    console.error(error); 

    this._playEmptyFrame(); //try to prevent connection timeouts

    if (error.statusCode === 403) this._handleYoutube403();
    if (error.code === 'ECONNREFUSED') this._handleGoogleConnectionRefused();
  } 

  _play() {
    const currentSongURL = this.serverQueue.songs[0];

    if (!currentSongURL) {
      this.serverQueue.voiceChannel.leave();
      this.queue.delete(this.msg.guild.id);
      return;
    }

    console.log(`Playing song: ${currentSongURL}`)

    this.stream = ytdl(currentSongURL, {
      quality: 'highestaudio',
      fmt: 'mp3'
    });

    if (this.serverQueue.connection) {
      this.dispatcher = this.serverQueue.connection
      .play(this.stream)
      .on("finish", () => {
          this.serverQueue.songs.shift();
          this._play();
      })
      .on(
        "error", error => this._handlePlayError(error)
      );

      this._sendSongTitle(currentSongURL);

      this.dispatcher.setVolumeLogarithmic(this.serverQueue.volume / 5);
    } else {
      console.log("Connection is undefined.")
      this.serverQueue.voiceChannel.leave();
    }
  }

  _shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
  
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
  
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
  
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  
    return array;
  }

  _startYoutubeSingleVideoQueue(queueConstruct, srcURL) {
    console.log("Playing single youtube song.")
    queueConstruct.songs.push(srcURL);

    this.serverQueue = this.queue.get(this.msg.guild.id);
    this._play(this.msg.guild, this.serverQueue.songs[0]);
  }

  _startYoutubeMixQueue(queueConstruct, playlist) {
    console.log("Playing youtube mix.")
    const mixURL = new URL(playlist);
    const videoId = mixURL.searchParams.get("v");

    ytmpl(videoId).then(
      playlist => {
        let playlistItems = playlist.items;

        if (this.shuffle) {
          playlistItems = this._shuffle(playlist.items)
        }
    
        for (let item of playlistItems) {
          queueConstruct.songs.push(`https://www.youtube.com/watch?v=${item.id}`);
        }

        this.serverQueue = this.queue.get(this.msg.guild.id);
        this._play(this.msg.guild, this.serverQueue.songs[0]);
      }
    )
  }

  _startYoutubePlaylistQueue(queueConstruct, playlist) {
    console.log("Playing youtube playlist.")
    let playlistItems = playlist.items;

    if (this.shuffle) {
      playlistItems = this._shuffle(playlist.items)
    }

    for (let item of playlistItems) {
      queueConstruct.songs.push(item.shortUrl);
    }

    this.serverQueue = this.queue.get(this.msg.guild.id);
    this._play(this.msg.guild, this.serverQueue.songs[0]);
  }

  _startSpotifyTrackOnYoutube(queueConstruct, src) {
    youtubeify(src).then(youtubeUrl => {
      this._startYoutubeSingleVideoQueue(queueConstruct, youtubeUrl);
    });
  }

  _startQueue(src, type) {
    console.log(src);

    const queueConstruct = {
      textChannel: this.msg.channel,
      voiceChannel: this.msg.member.voice.channel,
      connection: this.connection,
      songs: [],
      volume: 5,
      playing: true,
    };
    
    this.queue.set(this.msg.guild.id, queueConstruct);

    switch (type) {
      case "youtubeSingleVideo":
        this._startYoutubeSingleVideoQueue(queueConstruct, src);
      break;
      case "youtubeMix":
        this._startYoutubeMixQueue(queueConstruct, src);
      break;
      case "youtubePlaylist":
        this._startYoutubePlaylistQueue(queueConstruct, src);
      break;
      case "spotifyTrack":
        this._startSpotifyTrackOnYoutube(queueConstruct, src);
      break;
    }
  }

  _useYoutube(srcURL) {
    ytpl(srcURL).then(
      (playlist) => this._startQueue(playlist, "youtubePlaylist")
    ).catch((e) => { 
      const isShortYoutubeUrl = new URL(srcURL).hostname === "youtu.be";
      const isSingleVideo = e.message.includes("Unable to find a id in");
      const isMix = e.message.includes("Mixes not supported");

      let type = "";

      if (isSingleVideo) {
        type = "youtubeSingleVideo";
      } else if (isMix) {
        type = "youtubeMix";
      } else if (isShortYoutubeUrl) {
        type = "youtubeSingleVideo";
      }

      this._startQueue(srcURL, type);
    });
  }

  _useSpotify(srcURL) {
    const isTrack = youtubeify.validateURL(srcURL, "track");
    const isAlbum = youtubeify.validateURL(srcURL, "album")
    const isPlaylist = youtubeify.validateURL(srcURL, "playlist");

    if (isTrack) {
      this._startQueue(srcURL, "spotifyTrack");
    } else if (isAlbum) {
      this._startQueue(srcuURL, "spotifyAlbum");
    } else if (isPlaylist) {
      this._startQueue(srcURL, "spotifyAlbum");
    } else {
      this.msg.channel.send("😵 Malformed spotify url, try checking for typos.");
    }
    
  }

  _chooseProvider(srcURL) {
    let provider = new URL(srcURL).hostname;

    switch (provider) {
      case "youtu.be":
      case "www.youtube.com":
      case "youtube.com":
        this._useYoutube(srcURL);
      break;
      case "open.spotify.com":
        this._useSpotify(srcURL);
      break;
      default:
        this.msg.channel.send(`I don't support ${provider}.`)
      break;
    }

  }

  _lookForSongTitleOnYT(title) {
    yts(title).then(r => {
      let srcURL = r.videos[0].url;
      this.srcURL = srcURL;

      if (srcURL) {
        this._connectToVoice(this.msg);
      }
    });
  }

  _isValidUrl(url) {
    let isValid;

    try {
      new URL(url);
      isValid = true;
    } catch (e) {
      isValid = false;
    }

    return isValid;
  }

  _interceptPlayCommand(splitCommand, msg, shuffle) {
    this.msg = msg;
    this.shuffle = shuffle;

    const isValidUrl = this._isValidUrl(splitCommand[1]);

    if (isValidUrl) {
      this.srcURL = splitCommand[1];;

      if (this.srcURL) this._connectToVoice(this.msg);
    } else {
      const title = splitCommand[1];

      this._lookForSongTitleOnYT(title);
    }
 
  }

  _sendHelpEmbed(msg) {
    const usage = `
    \`\`\`
Usage:
gr/<command>
gr/[help | skip | stop | \n    play <URL | song title> | 
    shuffle <URL | song title>] 
\`\`\`
    `
    const examples = `
    \`\`\`
gr/play https://www.youtube.com/watch?v=JmijMVT3x-0 \n
gr/play Angie - Dope \n
gr/shuffle https://www.youtube.com/watch?v=JmijMVT3x-0&list=RDJmijMVT3x-0
\`\`\`
    `
    const embed = new Discord.MessageEmbed()
    .setColor('#000000')
    .setTitle("Grov")
    .setURL(this.githubPage)
    .setDescription(usage)
    .setThumbnail('https://i.imgur.com/CVoMXzm.png')
    .addFields(
      { name: 'help', value: 'Show this message.', inline: true },
      { name: 'skip', value: 'Skip the song.', inline: true },
      { name: 'stop', value: 'Stop the bot.', inline: true },
      { name: 'play', value: 'Play the song or the playlist in order.', inline: true },
      { name: 'shuffle', value: 'Play the song or play the playlist in random order.', inline: true },
      { name: 'usage examples:', value: examples}
    )
    .setFooter('Author: Barretta', 'https://i.imgur.com/4Ff284Z.jpg');

    msg.reply(embed);
  }

  _splitCommand(msg) {
    const indexOfFirstSpaceOccurrence = msg.content.indexOf(" ");
    const firstPartOfCommand = msg.content.substring(0, indexOfFirstSpaceOccurrence);
    const lastPartOfCommand = msg.content.substring(indexOfFirstSpaceOccurrence + 1, msg.content.length);
    const splittedCommand = [firstPartOfCommand, lastPartOfCommand];

    return splittedCommand;
  }

  _parseCommand(msg) {
    let splittedCommand = this._splitCommand(msg);
    splittedCommand = splittedCommand.filter(string => string !== "" && string !== " ");
    const prefix = splittedCommand[0] ? splittedCommand[0].toLowerCase() : "";
    
    if (prefix.includes(this.prefix)) {
      const commandNameSplitted = splittedCommand[0].split("/");
      const command = commandNameSplitted[1] ? commandNameSplitted[1].toLowerCase() : "";

      switch (command) {
        case "skip":
          this._skip();
        break;
        case "stop":
          this._disconnectFromVoice(msg);
        break;
        case "play":
          this._interceptPlayCommand(splittedCommand, msg);
        break;
        case "shuffle": 
          this._interceptPlayCommand(splittedCommand, msg, true);
        break;
        case "help":
          this._sendHelpEmbed(msg);
        break;
      }
    }
  }

  _shouldLeaveChannel(oldState) {
    let amIAlone;

    if (oldState.channel) {
      const amIInChannel = oldState.channel.members.get(this.guild.client.user.id);
      const members = [...oldState.channel.members];
      
      const humans = members.filter(member => {
       const isNotBot = !member[1].user.bot;
  
       return isNotBot;
      });

      amIAlone = !humans.length && amIInChannel;
    } else {
      amIAlone = false;
    }

    return amIAlone;
  }

  _tryLeaveVoiceChannel(oldState) {
    const shouldLeave = this._shouldLeaveChannel(oldState);

    if (shouldLeave) {
      this.serverQueue.voiceChannel.leave();
    }
  }

  onVoiceStateUpdate(oldState, newState) {
    this._tryLeaveVoiceChannel(oldState);
  }

  onMessage(msg) {
    if (!msg.author.bot) {
      this._parseCommand(msg);
    }
    
  }

}

module.exports = Grov;