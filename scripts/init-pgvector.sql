-- Script d'initialisation pour activer pgvector sur Railway
-- Ce script doit être exécuté une seule fois après la création de la base de données

-- Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Vérifier que l'extension est bien installée
SELECT * FROM pg_extension WHERE extname = 'vector';
