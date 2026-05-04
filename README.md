# cppcheckSR README

## Features

L'estensione permette di lanciare un analisi statica del codice per:
- singolo file
- intero progetto 

per l'analisi del progetto verrà usato il compile_command.json dentro la cartella build, se non presente il comando verrà lanciato privo delle opzioni di include e define.
L'estensione è generata su vs code 1.118, ma resa retrocompatibile da 1.60 in poi (npm run compile - vsce package)

## Requirements

Per il funzionamento è necessario avere installato [cppcheck] (https://en.wikipedia.org/wiki/Cppcheck) e averlo aggiunto alla variabile di ambiente PATH.

## Extension Settings

Impostazioni dell'estensione:

* `cppchecksr.enable`: Enable/disable dell'estensione.
* `cppchecksr.cppStandard`: selezione dello standard c++ per l'analisi.
* `cppchecksr.addOn`: selezione addon per cppcheck
* `cppchecksr.extraArgs`: possibilità di aggiungere argomenti custom

## Known Issues

Estensione pensata per linux.

## Release Notes
### 1.0.0

prima versione 03/05/2026
