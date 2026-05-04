# Cyber Breakout 🎮

A modern, cyberpunk-themed Breakout/Arkanoid-style game built with vanilla JavaScript, HTML5 Canvas, and CSS3. Features smooth 60fps gameplay, responsive design for desktop and mobile, and accessibility support.

![Cyber Breakout](https://img.shields.io/badge/version-1.0.0-cyan) ![License](https://img.shields.io/badge/license-MIT-green)

## 🌟 Features

- **Smooth Gameplay**: 60fps performance using `requestAnimationFrame`
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Touch Controls**: Swipe/drag to move paddle on mobile devices
- **Keyboard Support**: Arrow keys or mouse to control paddle
- **Multiple Controls**:
  - Desktop: Arrow keys, mouse, or click/tap to launch
  - Mobile: Swipe/drag to move paddle, tap to launch
- **Pause/Resume**: Pause with ESC, P, or pause button
- **Score Tracking**: Points vary by brick color (10-50 points)
- **Visual Effects**: Neon cyberpunk theme with glow effects and smooth animations
- **Accessibility**: 
  - ARIA labels and roles
  - Keyboard navigation
  - Focus management
  - High contrast mode support
  - Reduced motion support

## 🎮 How to Play

### Objective
Destroy all bricks by bouncing the ball with your paddle. Don't let the ball fall below the paddle!

### Controls

#### Desktop
| Action | Key/Mouse |
|--------|-----------|
| Move Paddle Left | ← Arrow Key |
| Move Paddle Right | → Arrow Key |
| Move Paddle | Mouse movement |
| Launch Ball | Space or Click |
| Pause/Resume | ESC or P key |

#### Mobile
| Action | Gesture |
|--------|---------|
| Move Paddle | Swipe or drag left/right |
| Launch Ball | Tap anywhere on game area |
| Pause/Resume | Tap pause button |

### Scoring
Bricks have different point values based on their color:
- 🔴 Red bricks: 10 points
- 🟡 Yellow bricks: 20 points
- 🔵 Cyan bricks: 30 points
- 🟢 Green bricks: 40 points
- 🟣 Purple bricks: 50 points

### Game Flow
1. **Start Screen**: Click "START GAME" to begin
2. **Launch**: Click, tap, or press Space to launch the ball
3. **Play**: Destroy all bricks while keeping the ball in play
4. **Pause**: Press ESC/P or pause button to pause
5. **Win**: Clear all bricks to achieve victory!
6. **Lose**: Lose all 3 lives to see Game Over screen
7. **Restart**: Click "PLAY AGAIN" to start fresh

## 🚀 Quick Start

### Option 1: Open Directly (No Server Required)

Simply open `index.html` in any modern web browser:

```bash
# On macOS
open index.html

# On Windows
start index.html

# On Linux
xdg-open index.html
```

### Option 2: Using a Local Server (Recommended)

For best results, especially during development, use a local server:

#### Using Python 3
```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

#### Using Python 2
```bash
python -m SimpleHTTPServer 8000
# Open http://localhost:8000
```

#### Using Node.js (npx)
```bash
npx serve
# Open the URL shown in terminal
```

#### Using PHP
```bash
php -S localhost:8000
# Open http://localhost:8000
```

## 📁 Project Structure

```
cyber-breakout/
├── index.html      # Main HTML structure
├── styles.css      # Cyberpunk theme and responsive styling
├── game.js         # Game logic and mechanics
└── README.md       # This file
```

## 🎨 Game Mechanics

### Paddle
- Width: 120px
- Height: 15px
- Movement: Smooth keyboard or mouse control
- Ball bounce angle varies based on where ball hits paddle

### Ball
- Radius: 8px
- Initial speed: 5 pixels/frame
- Maximum speed: 10 pixels/frame
- Speed increases by 0.05 for each brick destroyed
- Launch angle: Random between 45-60 degrees

### Bricks
- Total: 50 bricks (5 rows × 10 columns)
- Dimensions: Calculated to fit canvas with padding
- 5 types with different colors and point values
- 3D gradient effect for visual depth

### Lives
- Start with 3 lives
- Lose a life when ball falls below paddle
- Game over when all lives are lost

## 🌐 Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

**Required Features:**
- HTML5 Canvas support
- ES6 JavaScript support
- CSS Grid/Flexbox support

## ♿ Accessibility Features

- **ARIA Labels**: All interactive elements have descriptive labels
- **Keyboard Navigation**: Full game playable with keyboard
- **Focus Management**: Automatic focus handling for screen readers
- **High Contrast Mode**: Enhanced visibility for high contrast preferences
- **Reduced Motion**: Respects prefers-reduced-motion setting
- **Screen Reader Support**: Proper roles and live regions for score updates

## 🎯 Performance

- **Frame Rate**: Target 60fps using `requestAnimationFrame`
- **Optimized Rendering**: Single canvas clearing per frame
- **Efficient Collision**: Simple AABB collision detection
- **Responsive Scaling**: CSS-based scaling maintains performance on all devices

## 🐛 Known Issues

None currently. If you find any issues, please report them.

## 🔧 Customization

You can easily customize the game by modifying the constants at the top of `game.js`:

```javascript
// Canvas dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Paddle settings
const PADDLE_WIDTH = 120;
const PADDLE_HEIGHT = 15;
const PADDLE_SPEED = 8;

// Ball settings
const BALL_RADIUS = 8;
const INITIAL_BALL_SPEED = 5;
const MAX_BALL_SPEED = 10;

// Game settings
const INITIAL_LIVES = 3;
const BRICK_ROWS = 5;
const BRICK_COLS = 10;
```

You can also modify colors and themes in `styles.css` by changing the CSS variables:

```css
:root {
    --neon-pink: #ff00ff;
    --neon-cyan: #00ffff;
    --neon-green: #00ff00;
    --neon-blue: #0080ff;
    --dark-bg: #0a0a0f;
}
```

## 📝 Development

### Code Structure

**Classes:**
- `Paddle`: Handles paddle movement and rendering
- `Ball`: Manages ball physics, collision, and rendering
- `Brick`: Represents individual bricks with properties

**Main Functions:**
- `init()`: Initializes game and event listeners
- `gameLoop()`: Main game loop called via requestAnimationFrame
- `startGame()`: Resets and starts a new game
- `togglePause()`: Pauses/resumes the game
- `loseLife()`: Handles losing a life
- `checkWin()`: Checks if all bricks are destroyed

### Adding New Features

The code is modular and well-commented, making it easy to extend. Consider:
- Adding power-ups (wider paddle, multi-ball, etc.)
- Implementing multiple levels with different brick layouts
- Adding sound effects and background music
- Creating a high score system with localStorage

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Credits

Created as a demonstration of modern vanilla JavaScript game development with best practices for performance, accessibility, and responsive design.

## 📮 Support

For questions, issues, or suggestions, please open an issue in the project repository.

---

**Enjoy playing Cyber Breakout! 🎮✨**
