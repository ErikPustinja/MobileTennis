import { PROTOCOL_VERSION } from '@mobitenis/protocol';

const app = document.getElementById('app');
if (app) {
  app.textContent = `Mobitenis kontroler (protokol v${PROTOCOL_VERSION})`;
}
