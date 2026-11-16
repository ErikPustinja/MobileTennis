import { createApp } from 'vue';
import { registerOfflineCache } from '@mobitenis/net';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');
if (import.meta.env.PROD) registerOfflineCache('./sw.js', './');
