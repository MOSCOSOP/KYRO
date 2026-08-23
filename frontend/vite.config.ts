import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    port: 5173,
    // El frontend habla con el backend por rutas relativas: en desarrollo se
    // reenvían aquí, en producción se sirven desde el mismo dominio.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/realtime': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    /*
     * Los mapas de código solo en desarrollo.
     *
     * Publicados, cualquiera puede abrir las herramientas del navegador y leer
     * el código fuente entero —con sus comentarios y sus nombres de variable—
     * como si tuviera el repositorio delante. Para depurar en producción están
     * los mensajes de error del propio backend.
     */
    sourcemap: mode !== 'production',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
}));
