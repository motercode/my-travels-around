# Integración continua

## Workflow

`.github/workflows/test.yml`:

```yaml
name: tests
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npm test
```

- La misma versión mayor de Node que en local.
- `--ignore-scripts`: jsdom no necesita scripts de instalación, y así una dependencia comprometida no
  ejecuta nada al instalarse.
- `pull_request` sin filtro de ramas: también corre en los PR encadenados, cuya base no es `main`.
- Las pruebas que crean repositorios git temporales (las de los hooks) funcionan en el runner, que trae git.

## Protección de main

En *Settings → Branches → Add rule* para `main`:

- exigir pull request antes de fusionar;
- exigir que pase el check `tests`;
- no permitir force-push ni borrado.

Es la única barrera real: los hooks de agentes son una ayuda local.
