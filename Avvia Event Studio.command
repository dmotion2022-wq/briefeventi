#!/bin/zsh
# Avvia Event Studio: doppio clic su questo file.
# Si apre il Terminale, parte l'interfaccia insieme al worker AI e poi si apre il browser.
# Per spegnere tutto: chiudi la finestra del Terminale oppure premi Ctrl+C.

cd "$(dirname "$0")" || exit 1

PORT="${PORT:-3100}"
bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'; off=$'\033[0m'

stop_with() {
  printf '\n%s%s%s\n' "$red$bold" "$1" "$off"
  [[ -n "$2" ]] && printf '%s\n' "$2"
  printf '\nPremi Invio per chiudere. '
  read -r _
  exit 1
}

is_event_studio() {
  curl -fsS -m 3 "http://localhost:$1/api/health" 2>/dev/null | grep -q '"app":"event-studio"'
}

# Già acceso (per esempio da un'altra finestra): basta aprire il browser.
if is_event_studio "$PORT"; then
  printf 'Event Studio è già acceso: http://localhost:%s\n' "$PORT"
  [[ -z "$NO_OPEN" ]] && open "http://localhost:$PORT"
  exit 0
fi
# Porta occupata da un altro programma: si usa la prima libera.
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
export PORT

# Serve Node 24. Sul Mac ce ne possono essere altri (Homebrew, vecchie versioni): si preferisce quello di nvm.
NVM_NODES="$HOME/.nvm/versions/node"
if [[ -d "$NVM_NODES" ]]; then
  best=$(ls -1 "$NVM_NODES" | grep -E '^v24\.' | sort -t. -k2,2n -k3,3n | tail -1)
  [[ -n "$best" ]] && export PATH="$NVM_NODES/$best/bin:$PATH"
fi
node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' >/dev/null 2>&1
}
node_ok || stop_with "Manca Node 24." "Apri il Terminale, scrivi  nvm install 24  e poi riapri questo file."

if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  printf 'Installo le dipendenze (serve solo la prima volta, qualche minuto)…\n'
  npm install --no-audit --no-fund || stop_with "Installazione non riuscita." "Controlla la connessione a internet e riapri questo file."
fi

[[ -f .env.local ]] || cp .env.example .env.local

open_when_ready() {
  local i
  for i in {1..240}; do
    if is_event_studio "$PORT"; then
      printf '\n%s✔ Event Studio è pronto:%s http://localhost:%s\n' "$green$bold" "$off" "$PORT"
      printf '  Per spegnerlo chiudi questa finestra oppure premi Ctrl+C.\n\n'
      [[ -z "$NO_OPEN" ]] && open "http://localhost:$PORT"
      return 0
    fi
    sleep 1
  done
  printf '\n%sEvent Studio non è partito: guarda gli errori qui sopra.%s\n' "$red" "$off"
}
open_when_ready &

printf 'Avvio Event Studio… (la prima volta ci vuole circa un minuto)\n\n'
npm run dev
code=$?
printf '\nEvent Studio si è fermato.\n'
if [[ $code -ne 0 ]]; then
  printf "Se l'errore parla di better-sqlite3 o di NODE_MODULE_VERSION, nel Terminale, in questa cartella, scrivi:  npm rebuild\n"
fi
exit $code
