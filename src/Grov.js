//Sometimes crashes with a cryptic numeric error during debug (on nodev16): "Process exited with code 3221225477"
//to resolve:
//$ npm run clean 

const Discord = require("discord.js");
const ytpl = require('ytpl');
const ytmpl = require('../lib/yt-mix-playlist');
const yts = require('yt-search');
const Readable = require("stream").Readable;
const youtubeify = require('../lib/youtubeify');
const spotifyApi = require('spotify-url-info');
const yt = require("./YT.js");

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xF8, 0xFF, 0xFE]));
  }
}

class Grov {
  constructor(guild) {
    this.guild = guild;
    this.prefix = "gr";
    this.githubPage = "https://github.com/VioletFlare/grov";
    this.serverQueue = null;
  }

  timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _playEmptyFrame() {
    const emptyFrame = new Silence();
    this.connection.play(emptyFrame);
  }

  _setConnectionEvents() {
    this.connection.on("disconnect", () => {
      this.serverQueue = null;
      console.log("Disconnected from voice channel.")
    })
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
      const isAlreadyConnectedToVoice = this.guild.voice?.connection?.voiceManager?.connections?.size;

      if (isAlreadyConnectedToVoice) {
        this._chooseProvider(this.srcURL);
      } else {
        channel.join().then(connection => {
          this.connection = connection;
          this._playEmptyFrame(); // playing silence to patch voice bug 
          this._chooseProvider(this.srcURL);
          this._setConnectionEvents();
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

  _sendSongTitle(songURL) {
    yt.getBasicInfo(songURL).then(async info => {
      const embed = new Discord.MessageEmbed()
      .setColor('#000000')
      .setTitle(`🔊   ${info.videoDetails.title}`)
      .setURL(songURL);
    
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

  _handleGoogleConnectionError() {
    console.log("Connection refused/reset, retrying...");

    const seek = Math.floor(
      (Date.now() - this.serverQueue.start) / 1000
    );

    this._play(seek);
  }

  _handleYoutube410() {
    console.log("Age restricted video skipping.");
    this.msg.reply("This video is age restricted. Take your porn elsewhere 😡.");

    this.serverQueue.songs.shift();
    
    this.timeout(250).then(
      () => this._play()
    )
  }

  _handlePlayError(error) {
    console.log("Error caught in the voice connection.");
    console.error(error); 

    this.serverQueue.playing = false;

    this._playEmptyFrame(); //try to prevent connection timeouts

    if (error.statusCode === 403) this._handleYoutube403();
    if (error.statusCode === 410) this._handleYoutube410();
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') this._handleGoogleConnectionError();
  } 

  _playNextSong() {
    this.serverQueue.songs.shift();
    this.serverQueue.playing = false;
    this._play();
  }

  _play(seek) {
    if (this.serverQueue.playing) {
      return;
    } else {
      this.serverQueue.playing = true;
    }

    const currentSongURL = this.serverQueue.songs[0];

    if (!currentSongURL) {
      this.serverQueue.voiceChannel.leave();
      this.serverQueue = null;
      return;
    }

    console.log(`Playing song: ${currentSongURL}`)

    this.stream = yt.getStream(currentSongURL);

    if (this.serverQueue.connection) {
      this.dispatcher = this.serverQueue.connection
      .play(
        this.stream, { seek: seek ? seek : 0 }
      )
      .on(
        "start", () => this.serverQueue.start = seek ? this.serverQueue.start : Date.now()
      )
      .on(
        "finish", () => this._playNextSong()
      )
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

  _startOrAddToYoutubeSingleVideoQueue(queueConstruct, srcURL) {
    console.log("Song added to queue: " + srcURL)
    queueConstruct.songs.push(srcURL);

    this._play();
  }

  _startOrAddToYoutubeMixQueue(queueConstruct, playlist) {
    console.log("Mix added to queue.")
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

        this._play();
      }
    )
  }

  _startOrAddToYoutubePlaylistQueue(queueConstruct, playlist) {
    console.log("Playlist added to queue.")
    let playlistItems = playlist.items;

    if (this.shuffle) {
      playlistItems = this._shuffle(playlist.items)
    }

    for (let item of playlistItems) {
      queueConstruct.songs.push(item.shortUrl);
    }

    this._play();
  }

  _startOrAddToSpotifyTrackOnYoutube(queueConstruct, src) {
    youtubeify(src).then(youtubeUrl => {
      this._startOrAddToYoutubeSingleVideoQueue(queueConstruct, youtubeUrl);
    });
  }

  _startOrAddToSpotifyPlaylistQueue(queueConstruct, src) {
    spotifyApi.getTracks(src).then(tracks => {
      let queries = [];

      tracks.forEach((track) => {
        let query = ""

        track.artists.forEach((artist) => {
          query += `${artist.name} `;
        })

        query += track.name;
        queries.push(query);
      })

      let youtubeSongPromises = [];

      queries.forEach((query) => {
        const ytsPromise = yts(query);

        youtubeSongPromises.push(ytsPromise);
      })

      Promise.all(youtubeSongPromises).then(
        (youtubeSearchResults) => {
          youtubeSearchResults.forEach(searchResult => {
            queueConstruct.songs.push(searchResult.videos[0].url);
          })

          this._play();
        }
      );
      
    })
  }

  _getQueueConstruct() {
    if (!this.serverQueue) {
      this.serverQueue = {
        textChannel: this.msg.channel,
        voiceChannel: this.msg.member.voice.channel,
        connection: this.connection,
        songs: [],
        volume: 5,
        start: 0,
        playing: false,
      };
    }

    return this.serverQueue;
  }

  _startOrAddToQueue(src, type) {
    const queueConstruct = this._getQueueConstruct();

    switch (type) {
      case "youtubeSingleVideo":
        this._startOrAddToYoutubeSingleVideoQueue(queueConstruct, src);
      break;
      case "youtubeMix":
        this._startOrAddToYoutubeMixQueue(queueConstruct, src);
      break;
      case "youtubePlaylist":
        this._startOrAddToYoutubePlaylistQueue(queueConstruct, src);
      break;
      case "spotifyTrack":
        this._startOrAddToSpotifyTrackOnYoutube(queueConstruct, src);
      break;
      case "spotifyAlbum":
        this._startOrAddToSpotifyPlaylistQueue(queueConstruct, src);
      break;
      case "spotifyPlaylist":
        this._startOrAddToSpotifyPlaylistQueue(queueConstruct, src);
      break;
    }
  }

  _replaceUrl(srcURL) {
    const isMobileUrl = new URL(srcURL).hostname === "m.youtube.com";
    let url = srcURL;

    if (isMobileUrl) {
      url = url.replace("m.youtube.com", "youtube.com");
    }

    return url;
  }

  _useYoutube(srcURL) {
    srcURL = this._replaceUrl(srcURL);

    ytpl(srcURL).then(
      (playlist) => this._startOrAddToQueue(playlist, "youtubePlaylist")
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

      this._startOrAddToQueue(srcURL, type);
    });
  }

  _useSpotify(srcURL) {
    const isTrack = youtubeify.validateURL(srcURL, "track");
    const isAlbum = youtubeify.validateURL(srcURL, "album")
    const isPlaylist = youtubeify.validateURL(srcURL, "playlist");

    if (isTrack) {
      this._startOrAddToQueue(srcURL, "spotifyTrack");
    } else if (isAlbum) {
      this._startOrAddToQueue(srcURL, "spotifyAlbum");
    } else if (isPlaylist) {
      this._startOrAddToQueue(srcURL, "spotifyPlaylist");
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
      case "m.youtube.com":
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

    const param = splitCommand[1];
    const isValidUrl = this._isValidUrl(param);

    if (isValidUrl) {
      this.srcURL = param.trim();

      if (this.srcURL) this._connectToVoice(this.msg);
    } else if (param) {
      this._lookForSongTitleOnYT(param);
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
      { name: 'force', value: 'Play the song or the playlist forcefully, skipping the queue.', inline: true },
      { name: 'usage examples:', value: examples}
    )
    .setFooter('Author: \\ (Barretta)', 'https://i.imgur.com/lyv8H8C.png');

    msg.reply(embed);
  }

  _splitCommand(msg) {
    const indexOfFirstSpaceOccurrence = msg.content.indexOf(" ");
    const firstPartOfCommand = msg.content.substring(0, indexOfFirstSpaceOccurrence);
    const lastPartOfCommand = msg.content.substring(indexOfFirstSpaceOccurrence + 1, msg.content.length);
    const splittedCommand = [firstPartOfCommand, lastPartOfCommand];

    return splittedCommand;
  }

  _forcePlay(splittedCommand, msg) {
    this.serverQueue = null;

    this._interceptPlayCommand(splittedCommand, msg);
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
        case "force":
          this._forcePlay(splittedCommand, msg);
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