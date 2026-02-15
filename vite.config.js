import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],  // ← Make sure this line is here!
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});