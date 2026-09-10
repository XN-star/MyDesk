import React from 'react';
import ReactDOM from 'react-dom/client';
import WidgetWindow from './features/widget/WidgetWindow';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <WidgetWindow />
  </React.StrictMode>,
);
