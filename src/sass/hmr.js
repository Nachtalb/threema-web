// Importing the stylesheet from a self-accepting module keeps a style update
// from bubbling to the entry, which would trigger a full page reload.
import './app.scss';

if (module.hot) {
    module.hot.accept('./app.scss');
}
