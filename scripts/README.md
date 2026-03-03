# Scripts d'initialisation

## init-db.js

Script Node.js pour initialiser la base de données PostgreSQL avec l'extension pgvector.

### Utilisation

```bash
# Avec Railway CLI
railway run npm run db:init

# Ou directement avec Node
DATABASE_URL="postgresql://..." node scripts/init-db.js
```

### Ce que fait ce script

1. Se connecte à la base de données PostgreSQL
2. Active l'extension `vector` (pgvector)
3. Vérifie que l'extension est bien installée
4. Affiche le statut de l'initialisation

### Prérequis

- PostgreSQL avec support de l'extension pgvector
- Variable d'environnement `DATABASE_URL` configurée
- Package `pg` installé (déjà dans les dépendances)

## init-pgvector.sql

Script SQL brut pour activer pgvector. Peut être exécuté directement dans un client PostgreSQL.

### Utilisation

```bash
# Avec psql
psql $DATABASE_URL -f scripts/init-pgvector.sql

# Ou copier-coller dans un client SQL
```

## Quand utiliser ces scripts ?

**Exécutez ces scripts UNE SEULE FOIS** après avoir créé votre base de données PostgreSQL sur Railway, et **AVANT** d'exécuter les migrations Prisma.

Ordre d'exécution :
1. Créer la base PostgreSQL sur Railway
2. Exécuter `npm run db:init` (active pgvector)
3. Exécuter `npx prisma migrate deploy` (crée les tables)
4. Démarrer l'application

## Dépannage

### Erreur : "extension vector does not exist"

Railway PostgreSQL supporte pgvector par défaut. Si vous obtenez cette erreur :
- Vérifiez que vous utilisez bien PostgreSQL (pas MySQL)
- Vérifiez que votre version de PostgreSQL est >= 11
- Contactez le support Railway si le problème persiste

### Erreur : "permission denied to create extension"

Votre utilisateur n'a pas les droits pour créer des extensions. Sur Railway, l'utilisateur par défaut devrait avoir ces droits. Si ce n'est pas le cas :
- Vérifiez que vous utilisez bien la variable `DATABASE_URL` fournie par Railway
- Essayez de vous connecter en tant que superuser si disponible
