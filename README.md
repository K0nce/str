# FileShare

FileShare to prosta strona do wymiany plików z dwoma trybami:

- **Chmura** — upload plików do Firebase Storage
- **P2P** — bezpośrednia wymiana plików przez WebRTC, z sygnalizacją w Firebase Firestore

Strona działa na GitHub Pages.

## Wymagania

- konto GitHub
- projekt Firebase
- włączone usługi: Authentication, Firestore, Storage

## Konfiguracja Firebase

1. Wejdź do Firebase Console: https://console.firebase.google.com
2. Utwórz projekt
3. Włącz **Authentication** → **Anonymous**
4. Włącz **Firestore Database**
5. Włącz **Storage**
6. Dodaj web app i skopiuj obiekt `firebaseConfig`
7. Wklej `firebaseConfig` do `assets/app.js`

## Reguły Firestore

Użyj tego na start do testów P2P:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if request.auth != null;
      match /{subcollection}/{docId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

## Reguły Storage

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Tryb P2P

1. Otwórz stronę na dwóch urządzeniach
2. Na pierwszym kliknij **Utwórz pokój**
3. Skopiuj kod pokoju
4. Na drugim wklej kod i kliknij **Połącz**
5. Po połączeniu wybierz pliki i kliknij **Wyślij pliki**

## Deploy na GitHub Pages

Repo jest już przygotowane do automatycznego deployu przez GitHub Actions.

Jeśli chcesz przejść ręcznie:

```bash
git add .
git commit -m "Update FileShare"
git push origin main
```

GitHub Pages powinien publikować branch `main`.

## Uwagi

- Tryb chmury korzysta z Firebase Storage.
- Tryb P2P korzysta z WebRTC i Firestore do sygnalizacji.
- Jeśli chcesz, mogę dodać kod QR dla pokoju albo lepszy widok postępu transferu.
