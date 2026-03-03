/**
 * Script d'initialisation de la base de données pour Railway
 * Active l'extension pgvector nécessaire pour le RAG
 */

const { Pool } = require('pg');

async function initDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔧 Initialisation de la base de données...');
    
    // Activer l'extension pgvector
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✅ Extension pgvector activée');
    
    // Vérifier que l'extension est bien installée
    const result = await pool.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Extension pgvector vérifiée et fonctionnelle');
    } else {
      console.warn('⚠️  Extension pgvector non trouvée');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Exécuter le script
initDatabase()
  .then(() => {
    console.log('✅ Initialisation terminée avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Échec de l\'initialisation:', error);
    process.exit(1);
  });
