const Discord = require("discord.js");
const client = new Discord.Client();
const ytdl = require("discord-ytdl-core");
const ytpl = require('ytpl');
const ytmpl = require('yt-mix-playlist');
const keepAlive = require('./server.js');
const config = require('./config.js');

const isDev = process.argv.includes("--dev");

if (process.env['REPLIT']) {
  (async () => keepAlive())();
}

class Grov {
  constructor() {
    this.prefix = "gr";
    this.queue = new Map();
    this.githubPage = "https://github.com/VioletFlare/grov";
    this.emptyVideo = "https://www.youtube.com/watch?v=kvO_nHnvPtQ";
  }

  _connectToVoice(msg) {
    const channelID = msg.member.voice.channelID;
    const channel = client.channels.cache.get(channelID);

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
      channel.join().then(connection => {
        this.connection = connection;
        this.connection.play(ytdl(this.emptyVideo,
        {
          filter: "audioonly",
          fmt: "mp3"
        }))
        this._startPlaylist(this.msg, this.playlistURL, this.shuffle);
        console.log("Successfully connected.");
      }).catch(e => {
        console.error(e);
      });
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

  _play(guild, song) {
    if (!song) {
      this.serverQueue.voiceChannel.leave();
      this.queue.delete(guild.id);
      return;
    }

    console.log(`Playing song: ${song}`)

    const stream = ytdl(song, {
      filter: "audioonly",
      fmt: "mp3"
    });

    if (this.serverQueue.connection) {
      this.dispatcher = this.serverQueue.connection
      .play(stream)
      .on("finish", () => {
          this.serverQueue.songs.shift();
          this._play(guild, this.serverQueue.songs[0]);
      })
      .on("error", error => console.error(error));

      this._sendSongTitle(song);

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

  _startQueue(playlist, isSingleVideo, isMix) {
    console.log(playlist);
    const queueConstruct = {
      textChannel: this.msg.channel,
      voiceChannel: this.msg.member.voice.channel,
      connection: this.connection,
      songs: [],
      volume: 5,
      playing: true,
    };
    
    this.queue.set(this.msg.guild.id, queueConstruct);

    if (isSingleVideo) {
      console.log("Playing single song.")
      queueConstruct.songs.push(playlist);

      this.serverQueue = this.queue.get(this.msg.guild.id);
      this._play(this.msg.guild, this.serverQueue.songs[0]);
    } else if (isMix) {
      console.log("Playing mix.")
      const mixURL = new URL(playlist);
      const videoId = mixURL.searchParams.get("v");

      const ytmplPromise = new Promise(async (resolve, reject) => {
        const mixPlaylist = ytmpl(videoId);
        resolve(mixPlaylist);
      })

      ytmplPromise.then(
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
    } else {
      console.log("Playing playlist.")
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


  }

  _startPlaylist(msg, playlistURL, shuffle) {
    ytpl(playlistURL).then(
      (playlist) => this._startQueue(playlist, false)
    ).catch((e) => { //ytpl sometimes crashes with a cryptic numeric error during debug
      const isSingleVideo = e.message.includes("Unable to find a id in");
      const isMix = e.message.includes("Mixes not supported");
      this._startQueue(playlistURL, isSingleVideo, isMix);
    });
  }

  _interceptPlayCommand(splitCommand, msg, shuffle) {
    let playlistURL = splitCommand[1];
    this.msg = msg;
    this.playlistURL = playlistURL;
    this.shuffle = shuffle;

    if (playlistURL) {
      this._connectToVoice(msg);
    }
  }

  _parseCommand(msg) {
    let content = msg.content.toLowerCase();
    const usage = `
    \`\`\`
Usage:
gr/<command>
gr/[help | skip | stop | \n    play <URL> | shuffle <URL>] 
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
    )
    .setFooter('Author: Barretta', 'https://i.imgur.com/4Ff284Z.jpg');

    let splitCommand = msg.content.split(" ");
    splitCommand = splitCommand.filter(string => string !== "" && string !== " ");

    
    const prefix = splitCommand[0]?.toLowerCase();

    if (prefix.includes(this.prefix)) {
      const commandNameSplitted = splitCommand[0]?.split("/");
      const command = commandNameSplitted[1]?.toLowerCase();

      switch (command) {
        case "skip":
          this._skip();
        break;
        case "stop":
          this._disconnectFromVoice(msg);
        break;
        case "play":
          this._interceptPlayCommand(splitCommand, msg);
        break;
        case "shuffle": 
          this._interceptPlayCommand(splitCommand, msg, true);
        break;
        case "help":
          msg.reply(embed);
        break;
      }
    }
  }

  onMessage(msg) {
    if (!msg.author.bot) {
      this._parseCommand(msg);
    }
    
  }

}

const grov = new Grov();

if (isDev) {
  client.login(config.TOKEN_DEV);
} else {
  client.login(config.TOKEN_PROD);
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`)

  client.user.setActivity(
    `gr/help`, {type: 'PLAYING'}
  );
});

client.on("message", msg => grov.onMessage(msg));
