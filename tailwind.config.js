// Tailwind CSS settings. The app's styles are built into the app when it's packaged
// (instead of loading Tailwind from a website every time the page opens).
//
// The "old library" look: the colour names the screens use are given library colours here,
// so every page changes together:
//   orange → forest green (buttons, links, the current page)
//   amber / yellow → brass (stars, highlights)
//   slate → warm ink and parchment browns (text, borders, light backgrounds)
//   violet → oxblood leather (your shelves)
//   white → a soft cream
export const palette = {
  orange: { 50: '#eef3ef', 100: '#dce7df', 200: '#bfd0c4', 300: '#94ae9c', 400: '#5b7767', 500: '#2f4a3d', 600: '#24392f', 700: '#1e2f26', 800: '#172520', 900: '#111a15', 950: '#0b120e' },
  amber: { 50: '#fbf5e6', 100: '#f5e9cb', 200: '#ecd7a3', 300: '#e0c07a', 400: '#d4a85a', 500: '#b8893b', 600: '#9a6f2b', 700: '#7d5823', 800: '#5c3a21', 900: '#4a2e19', 950: '#2e1c0f' },
  slate: { 50: '#faf6ee', 100: '#f1e9d8', 200: '#e3d7be', 300: '#cdbc9a', 400: '#a39073', 500: '#7c6b55', 600: '#5f4f3d', 700: '#4a3a2a', 800: '#3a2c1f', 900: '#2e2318', 950: '#1f170f' },
  violet: { 50: '#f8eeee', 100: '#f0dcdc', 200: '#e2b9b8', 300: '#cc8f8d', 400: '#b0625f', 500: '#8b3a37', 600: '#74302d', 700: '#5f2724', 800: '#4a1f1d', 900: '#3a1816', 950: '#260f0e' },
  // alerts: brick red instead of bright red/pink
  red: { 50: '#fbf0ec', 100: '#f5ddd5', 200: '#ebbcae', 300: '#dc937f', 400: '#c66a53', 500: '#a8473a', 600: '#8b3a2f', 700: '#723026', 800: '#5a261e', 900: '#461d17', 950: '#2b110d' },
  // "finished", "available": a muted garden green
  emerald: { 50: '#eef5ee', 100: '#d8e9d9', 200: '#b5d3b8', 300: '#8bb791', 400: '#5f9a6a', 500: '#3f7d4f', 600: '#33673f', 700: '#2a5434', 800: '#22432a', 900: '#1b3522', 950: '#102015' },
  // lending: a dusty ink blue
  sky: { 50: '#eef3f7', 100: '#d9e4ee', 200: '#b7cbdd', 300: '#8eabc6', 400: '#6589ad', 500: '#4b6f93', 600: '#3d5b7a', 700: '#334b64', 800: '#2a3d51', 900: '#223241', 950: '#151f29' },
  white: '#fffdf8'
};
palette.rose = palette.red;
palette.purple = palette.violet;
palette.fuchsia = palette.violet;
palette.indigo = palette.sky;
palette.yellow = palette.amber;

export default {
  content: [
    './index.html',
    './App.jsx',
    './src/**/*.{js,jsx}',
    './server/**/*.js' // account colours are chosen on the server
  ],
  theme: {
    extend: {
      colors: palette,
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        serif: ['"EB Garamond"', '"Iowan Old Style"', 'Georgia', 'serif']
      }
    }
  },
  plugins: []
};
