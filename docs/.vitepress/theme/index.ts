import DefaultTheme from 'vitepress/theme'
import MyLayout from './MyLayout.vue'
import Gallery from './components/Gallery.vue'
import AppCards from './components/AppCards.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: MyLayout,
  enhanceApp({ app }) {
    app.component('Gallery', Gallery)
    app.component('AppCards', AppCards)
  },
}
