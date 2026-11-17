# OmniDrive

A cinematic 3D driving experience and playable coastal sprint. Built with Three.js, a detailed Ferrari 458 Italia model, physically based metallic paint, environment reflections, soft shadows, and an animated coastal road.

## Run

From this directory, run `npm start`, then open **http://localhost:3000**. No installation or build step is needed. All runtime assets are included locally, so the experience also works without an internet connection.

The files can also be served directly by XAMPP at **http://localhost/omniroute-test/** when Apache is running. Open the page through an HTTP server; double-clicking `index.html` is unsupported because browser modules and model loading require HTTP.

## Open on your phone without public hosting

1. Connect your PC and phone to the same Wi-Fi. Connecting the PC to your phone's hotspot also works when the hotspot permits communication between devices.
2. Run `npm run lan` from this directory. This starts a separate phone-accessible preview on port **3001** and prints your PC's local network URL.
3. Open that printed **Phone / Wi-Fi** URL in your phone's browser, for example `http://192.168.1.20:3001`. Use your actual printed address, not `localhost`.
4. Keep the PC and server running while you play. Stop the server with Ctrl+C.

If Windows Firewall prompts for Node.js access, allow it on your trusted private network. Guest/public Wi-Fi may prevent devices from reaching one another; use a network that allows device-to-device communication. No router port forwarding or public hosting is needed. Your Wi-Fi address can change after reconnecting, so use the URL printed when starting the server.

`npm start` remains limited to this computer on port 3000. `npm run lan` shares only the game files and assets, not the rest of the project directory. Set `PORT` before running either command if you need a different port.

## Play the game

Click **Take the wheel** or **Play game**, then **Start engine**. After the countdown, drive 2 km through traffic. You start stationary; hold the accelerator to move.

| Control | Keyboard |
| --- | --- |
| Accelerate | W / Up arrow |
| Brake | S / Down arrow |
| Steer | A and D / Left and Right arrows |
| Boost | Hold Shift while accelerating |
| Chase / hood camera | C |
| Pause / resume | Escape / P / Space |
| Restart | R |

Touch devices have steering buttons, gas and brake pedals, and a boost button. Multiple buttons can be held together. Releasing a key or touch releases that control. Losing window focus or switching tabs automatically pauses the game.

Clean overtakes earn 75 points; close passes at speed earn 200. Finish the sprint for a bonus based on your remaining car condition. Collisions damage and slow the car, and scraping the barriers reduces car condition. Boost recharges when released. Your best score is saved in this browser when storage is available.

## Cinematic controls

- Drag the scene to rotate; scroll or pinch to zoom.
- Adjust the speed slider from 0–200 km/h. Wheels, road movement, and the simulated distance counter respond together.
- Choose Cinematic, Side, or Chase camera views.
- Select one of five metallic paint finishes.
- Click the atmosphere control to cycle Golden hour, Blue hour, and Midnight.
- Use The studio for a stationary, orbiting view of the car.
- Toggle optional synthesized engine and road sound; sound is off by default.
- Space pauses/resumes. Left/right arrow keys adjust speed by 5 km/h when a control is not focused.

The animation starts paused when the operating system requests reduced motion. Rendering and sound suspend while the tab is hidden.

## Development

`npm run check` checks the application and server JavaScript syntax. `npm test` checks the driving simulation and controller integration. `npm run assets` restores the pinned Three.js r170 engine, loaders, Draco decoder, and example assets from jsDelivr's mirror of the official Three.js repository.

Gameplay uses a fixed simulation step, independent of rendering. The simulation is in `driving-game.js`; the game interface, keyboard/touch input, traffic scene, and chase camera are in `game-controller.js`. Runtime assets and libraries are local; no external service or account is required.

## Credits

- Ferrari 458 Italia model: [vicent091036 on Sketchfab](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6), as credited in the [official Three.js car example](https://github.com/mrdoob/three.js/blob/r170/examples/webgl_materials_car.html). Model and ambient-occlusion texture distributed in Three.js examples.
- Venice Sunset environment: [Poly Haven](https://polyhaven.com/a/venice_sunset), CC0.
- Three.js r170: MIT license, included in `vendor/THREE-LICENSE.txt`.

This is an independent visual demonstration, unaffiliated with Ferrari. The displayed speed and distance are simulated.
