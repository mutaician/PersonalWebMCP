import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PersonalWebMCP',
    description: 'Teach, compose, and repair personal WebMCP capabilities.',
    permissions: ['sidePanel', 'storage', 'tabs', 'scripting'],
    host_permissions: ['http://localhost:3000/*'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    web_accessible_resources: [
      {
        resources: ['webmcp-main.js'],
        matches: ['http://localhost:3000/*'],
      },
    ],
    action: {
      default_title: 'Open PersonalWebMCP',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
