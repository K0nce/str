# FileShare — prosta strona do wymiany plików

Ta aplikacja to statyczny frontend (GitHub Pages) z zapisem plików w Firebase Storage (darmowy poziom). Projekt zawiera prosty interfejs z drag & drop oraz listą plików.

## Szybkie kroki konfiguracji (Firebase)

1. Wejdź na https://console.firebase.google.com i utwórz nowy projekt.
2. Wybierz "Storage" i utwórz zasobnik (domyślna lokalizacja jest OK).
3. W zakładce `Rules` ustaw tymczasowo reguły umożliwiające odczyt/zapis (przykład bez zabezpieczeń):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

   Uwaga: powyższe reguły dają publiczny dostęp. Jeśli chcesz prywatności, skonfiguruj Authentication i odpowiednie reguły.

4. W ustawieniach projektu (ikonka z kołem zębatym) -> `Project settings` -> `Your apps` -> dodaj aplikację webową. Skopiuj konfigurację Firebase (obiekt `firebaseConfig`).

5. W pliku `assets/app.js` wklej wartość `firebaseConfig` (z elementem `storageBucket`) zamiast przykładowego obiektu.

## Deploy na GitHub Pages

1. Zainicjuj repo w katalogu projektu, commit i wypchnij na GitHub.

```
git init
git add .
git commit -m "Initial FileShare site"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

2. W ustawieniach repo na GitHub włącz GitHub Pages i wybierz branch `main` oraz folder `/` (root) lub użyj folderu `docs/` jeśli preferujesz.

3. Po deployu strona będzie dostępna pod `https://USERNAME.github.io/REPO`.

## Uwagi

- Obecna konfiguracja Storage jest prosta i wymaga, byś wkleił prawidłowy `firebaseConfig` w `assets/app.js`.
- Możemy dodać uwierzytelnianie (Google, e-mail) i ograniczenia dostępu jeśli będziesz tego potrzebować.
- Jeśli wolisz inny backend (np. Supabase, S3 + Cloudflare Workers), mogę przerobić integrację.

## Automatyczny deploy (GitHub Pages)

Dodałem workflow GitHub Actions, który automatycznie opublikuje zawartość tego repo po push na branch `main`.

- Po udanym uruchomieniu akcji strona powinna być dostępna pod adresem: https://K0nce.github.io/str
- Możesz obserwować status akcji w zakładce `Actions` w repozytorium na GitHub.

Jeśli chcesz, mogę także pomóc ustawić bezpieczniejsze reguły Storage lub dodać uwierzytelnianie.
