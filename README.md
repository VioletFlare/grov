<p align="center">
  <img src="https://i.imgur.com/CVoMXzm.png">
  <p align="center">GR Bot, a discord bot for music</p>
</p>

## Installation

Launch

`npm i`

Create a `config.js` file in the root directory containing your discord bot credentials.

```
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
- **gr/play** \<URL\> - Play the song or the playlist in order.
- **gr/shuffle** \<URL\> - Play the song or play the playlist in random order.
