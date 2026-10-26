import { boot } from 'quasar/wrappers';
import pinia from '../stores';

export default boot(({ app }) => {
  app.use(pinia);
});
