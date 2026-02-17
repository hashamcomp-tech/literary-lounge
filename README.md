# Firebase Studio - Literary Lounge

This is a NextJS starter in Firebase Studio.

## Production Deployment (Vercel)

### 1. Set Environment Variables
Ensure all values from `src/firebase/config.ts` are added to your Vercel project settings.

### 2. Configure CORS for Storage
To fix "hanging" uploads in production, you must apply the CORS policy.
1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install).
2. Run the following command from the root directory:
   ```bash
   gsutil cors set docs/cors.json gs://studio-5792028843-a8d4c.firebasestorage.app
   ```

### 3. Sync & Status
- `npm run sync`: Pull latest changes.
- `npm run status`: Check git status.
