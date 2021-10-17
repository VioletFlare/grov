<p align="center">
  <img src="https://i.imgur.com/CVoMXzm.png">
  <p align="center">Grov, a discord bot for music</p>
</p>

![node-shield-image]

## Supported Platforms

youtube

## Installation

Launch

`npm i`

Create a `config.js` file in the root directory containing your discord bot credentials.

```js
module.exports = {
  TOKEN_PROD: "<Your Discord Bot Token Goes Here>"
}
```

## Running

`npm run start`

## Supported commands

- **gr/help** - Show a help message.
- **gr/skip** - Skip the song.
- **gr/stop** - Stop the bot.
- **gr/play** \<URL\> | \<title\> - Play the song or the playlist in order.
- **gr/shuffle** \<URL\> | \<title\> - Play the song or play the playlist in random order.

[node-shield-image]: https://img.shields.io/static/v1?label=node&message=14.16.1&color=green
