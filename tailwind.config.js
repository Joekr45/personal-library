// Tailwind CSS settings. The app's styles are built into the app when it's packaged
// (instead of loading Tailwind from a website every time the page opens).
export default {
  content: [
    './index.html',
    './App.jsx',
    './src/**/*.{js,jsx}',
    './server/**/*.js' // account colours are chosen on the server
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
