# Mes repas

Appli perso : stock (frigo, congélateur, placard), import du ticket Super U (PDF), recettes proposées selon ce que j'ai, suivi calories et macros.

Fichiers : `index.html` (l'appli), `data.js` (ingrédients et recettes), `sw.js` (hors ligne), icônes et manifeste.

## Mise en ligne (GitHub Pages)
Settings → Pages → Source : « Deploy from a branch », branche `main`, dossier `/ (root)`.

## Synchronisation (Firebase, facultatif)
1. Console Firebase → nouveau projet.
2. Authentication → Sign-in method → activer « E-mail/Mot de passe ».
3. Firestore Database → créer la base, puis onglet Règles :
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
4. Paramètres du projet → « Vos applications » → Web → copier `firebaseConfig`
   et le coller à la place de `const FIREBASE_CONFIG = null;` dans `index.html`.
5. Authentication → Settings → Domaines autorisés : ajouter `<ton-pseudo>.github.io`.

Sans config, l'appli marche en local (données dans le navigateur).
