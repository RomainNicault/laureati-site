CREATE TABLE correction (
  id INTEGER PRIMARY KEY,
  recu_le TEXT NOT NULL,
  page TEXT NOT NULL,
  producer_id TEXT,
  champ TEXT NOT NULL CHECK (champ IN ('adresse','telephone','site','nom','medaille','autre')),
  valeur_proposee TEXT NOT NULL CHECK (length(valeur_proposee) BETWEEN 1 AND 500),
  commentaire TEXT NOT NULL CHECK (length(commentaire) <= 2000),
  contact TEXT CHECK (contact IS NULL OR length(contact) <= 200),
  ip_hash TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau','accepte','rejete'))
);
CREATE INDEX correction_statut_recu_le ON correction (statut, recu_le);
CREATE INDEX correction_ip_hash_recu_le ON correction (ip_hash, recu_le);
