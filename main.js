const Discord = require("discord.js");
const client = new Discord.Client();
const ytdl = require("discord-ytdl-core");
const ytpl = require('ytpl');
const keepAlive = require('./server.js');
const config = require('./config.js');

const isDev = process.argv.includes("--dev");

if (process.env['REPLIT']) {
  (async () => keepAlive())();
}

class GRBot {
  constructor() {
    this.prefix = "gr";
    this.queue = new Map();
    this.githubPage = "https://www.github.com";
    this.emptyVideo = "https://www.youtube.com/watch?v=kvO_nHnvPtQ";
  }

  _connectToVoice(msg) {
    const channelID = msg.member.voice.channelID;
    const channel = client.channels.cache.get(channelID);

    if (!channelID) {
      return msg.channel.send("Per invitarmi entra prima nella voice chat.");
    }

    const permissions = channel.permissionsFor(msg.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
      return msg.channel.send(
        "Ho bisogno di permessi per connettermi a questa voice chat."
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
    if(!msg.guild.me.voice.channel) return msg.channel.send("Non sono in un canale.");

    msg.guild.me.voice.channel.leave();
  }

  _skip() {
    this.dispatcher.emit("finish");
  }

  _sendSongTitle(song) {
    ytdl.getBasicInfo(song).then(async info => {
      const embed = new Discord.MessageEmbed()
      .setColor('#0099ff')
      .setTitle(info.videoDetails.title)
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

  _startPlaylist(msg, playlistURL, shuffle) {
    ytpl(playlistURL).then(
      (playlist) => {
        console.log(playlist);
        const queueConstruct = {
          textChannel: msg.channel,
          voiceChannel: msg.member.voice.channel,
          connection: this.connection,
          songs: [],
          volume: 5,
          playing: true,
        };
        
        this.queue.set(msg.guild.id, queueConstruct);

        let playlistItems = playlist.items;

        if (shuffle) {
          playlistItems = this._shuffle(playlist.items)
        }
        
        for (let item of playlistItems) {
          queueConstruct.songs.push(item.shortUrl);
        }

        this.serverQueue = this.queue.get(msg.guild.id);
        this._play(msg.guild, this.serverQueue.songs[0]);
      }
    );
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
    .setTitle("GR Bot")
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

    const splitCommand = msg.content.split(" ");

    if (splitCommand[0].includes(this.prefix)) {
      const commandNameSplitted = splitCommand[0].split("/");
      const command = commandNameSplitted[1].toLowerCase();

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

const grBot = new GRBot();

if (isDev) {
  client.login(config.TOKEN_DEV);
} else {
  client.login(config.TOKEN_PROD);
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`)
});

client.on("message", msg => grBot.onMessage(msg));
