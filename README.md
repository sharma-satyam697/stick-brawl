# Stick Brawl

A 2-player stick fighting game that runs in the browser. There are 10 fighters, and each has 3 super powers.

- **2 Players**: both players share one keyboard.
- **vs Computer**: you fight the computer.
- **Online**: you and a friend type the same room name and fight from two computers.

## Run it

You need [Node.js](https://nodejs.org) 16 or newer. Nothing else is needed. There are no packages to install.

```bash
git clone https://github.com/sharma-satyam697/stick-brawl.git
cd stick-brawl
npm start
```

Then open **http://localhost:3000**.

To use a different port, run `PORT=8080 npm start`.

## Play online with a friend

1. Click **Online** (or press `3`).
2. Type a room name, for example `pizza42`, and click **Join room**.
3. Your friend opens the same server address, clicks **Online**, and types the same room name.
   You can also send them the link the game shows, for example `http://<address>:3000/?room=pizza42`.
4. When you are both in, you both pick a fighter, and the fight starts.

Your friend must be able to reach the computer that runs `npm start`. There are three ways to do this:

| Where is your friend? | What to do |
|---|---|
| Same Wi-Fi or network | Run `npm start`. The server prints a `Same Wi-Fi` address like `http://192.168.1.20:3000`. Your friend opens that address. If it does not load, allow Node.js through your firewall. |
| Somewhere else (quick test) | Run `npm start`. Then, in a second terminal, run a tunnel such as `npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`. Send your friend the `https://` address it prints. |
| Somewhere else (always on) | Deploy this repo to a host that runs Node.js and supports WebSockets, such as Render, Railway or Fly.io. Use `npm start` as the start command. The server reads the `PORT` variable that the host gives it. |

A room holds 2 players. If one player leaves, the other player stays in the room and waits for someone new.

## Controls

| Action | Player 1 | Player 2 | Game controller |
|---|---|---|---|
| Move | `A` `D` | `←` `→` | Left stick / D-pad |
| Jump | `W` | `↑` | A |
| Block | `S` | `↓` | Left trigger |
| Punch | `F` | `K` | X |
| Kick | `G` | `L` | Y |
| Grab / throw | `C` | `M` | Right trigger |
| Power smack | `V` | `,` | B |
| Super powers 1, 2, 3 | `R` `T` `Y` | `I` `O` `P` | LB, RB, stick click |

In an online match, each player plays on their own computer and can use either key set.

`Esc` pauses the game. In a local game, `` ` `` fills both super meters, so you can practise the super powers.

### Moves

- **Punch**: fast and weak.
- **Kick**: a bit slower and stronger. It hits lower.
- **Block**: hold block while facing the attacker. You take only a small part of the damage.
- **Grab**: short reach. A block does not stop it. It works only on a fighter who is standing on the ground.
  - While you hold someone, press grab, punch or forward to throw them forward.
  - Press back to throw them behind you.
  - If you do nothing, you throw them forward after a moment.
  - If you are grabbed, press grab within 0.25 seconds to break free.
- **Power smack**: a slow, charged punch. Your fighter glows while it charges. It does big damage, knocks the opponent far away, and breaks a block.
- **Super powers**: hits fill your super meter. Power 1 costs 1 bar, power 2 costs 2 bars, and power 3 costs the full meter.

## Change the fighters

Edit `characters.js` to change names, colors and super powers. The file explains every option.

To use face photos, add a `photos` folder with `1.jpg` to `10.jpg`. Photo 1 goes to fighter 1, and so on. If you put photos of real people in this folder, remember that they are public once you push the repo to GitHub. You can add `photos/` to `.gitignore` to keep them out.

## How online play works

- `server.js` is a small Node.js server with no dependencies. It serves the game files. It also runs a WebSocket endpoint at `/ws` that puts two players with the same room name together and passes their messages to each other.
- The first player in a room is the **host**. The host's browser runs the whole game: movement, hits, damage and rounds.
- The second player is the **guest**. The guest's browser sends its key presses to the host. About 60 times per second, the host sends back a snapshot: fighter positions, effects, new particles and sounds. The guest draws that snapshot.
- Only one browser decides what happens, so the two screens always agree. The cost is that the guest's own moves appear after one round trip to the host and back.

## Files

| File | What it is |
|---|---|
| `index.html` | Page layout and menus |
| `game.js` | The game: fighters, moves, super powers, drawing, online code |
| `characters.js` | The 10 fighters and their super powers |
| `server.js` | File server and online rooms |
