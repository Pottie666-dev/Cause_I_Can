# Ridgeway-Mansion

Simple Expo app + Node API + MongoDB.

## Architecture

- Mobile app: `App.js` (Expo / React Native)
- API server: `api/index.js` (Express)
- Database: MongoDB Atlas

## API env vars

Set these on Render (and later Google Cloud):

- `MONGODB_URI` (Mongo Atlas connection string)
- `MONGODB_DB` (database name)

Optional compatibility vars also supported:

- `RIDGEWAY_MONGODB_URI`
- `RIDGEWAY_MONGODB_DB`

## API endpoints

- `GET /health` - API and DB health check
- `GET /api/items` - list items
- `POST /api/items` - create item with `{ "title": "..." }`

## Local development

- Run Expo app: `npm run dev`
- Run API server: `npm run dev:api`

Set Expo app API URL via env:

- `EXPO_PUBLIC_API_URL=https://your-render-service.onrender.com`

## Render deploy

- Create a Web Service from this repo.
- Render reads `render.yaml`.
- Configure `MONGODB_URI` and `MONGODB_DB` in Render env vars.
