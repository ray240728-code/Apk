# APK SHARE - Firebase Edition

This application is a static React app that uses Firebase for storage and metadata. It is designed to be hosted on static platforms like Netlify, Vercel, or InfinityFree.

## Deployment Instructions

### 1. Build the Application
Run the following command to create a production build:
```bash
npm run build
```
This will generate a `dist/` folder containing the static files.

### 2. Deploy to Netlify
-   **Option A (Drag & Drop):** Drag the `dist/` folder into the Netlify dashboard.
-   **Option B (Git):** Connect your repository to Netlify. The `netlify.toml` file is already configured to handle the build and routing.

### 3. Deploy to InfinityFree
-   Upload the contents of the `dist/` folder to your `htdocs/` directory via FTP.
-   Ensure you have a `.htaccess` file for SPA routing (if needed).

## Firebase Configuration
The app uses the configuration in `src/firebase-applet-config.json`. Ensure your Firebase project has **Storage** and **Firestore** enabled.

### Firestore Rules
The `firestore.rules` file is included in the project. You can deploy it using the Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

### Storage Rules
Ensure your Firebase Storage rules allow public reads and authenticated (or public, depending on your needs) writes.
Example Storage Rules:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /apks/{fileId}/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 100 * 1024 * 1024; // 100MB limit
    }
  }
}
```
