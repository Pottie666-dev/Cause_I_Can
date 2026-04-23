import React from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { MobileApp } from './src/mobile-app';

const convexUrl =
  process.env.EXPO_PUBLIC_CONVEX_URL ||
  process.env.VITE_CONVEX_URL ||
  'https://3210-ij05s8lznxtn20lyzb3i9.app.cto.new';

const convex = new ConvexReactClient(convexUrl);

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <MobileApp />
    </ConvexProvider>
  );
}
