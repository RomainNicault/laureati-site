-- ip_hash devient facultatif : l'empreinte est effacée au-delà de 48 h (minimisation).
-- SQLite ne retire pas une contrainte NOT NULL : recréation de table avec copie,
-- index recréés à l'identique.
CREATE TABLE correction_new (
  id INTEGER PRIMARY KEY,
  recu_le TEXT NOT NULL,
  page TEXT NOT NULL,
  producer_id TEXT,
  champ TEXT NOT NULL CHECK (champ IN ('adresse','telephone','site','nom','medaille','autre')),
  valeur_proposee TEXT NOT NULL CHECK (length(valeur_proposee) BETWEEN 1 AND 500),
  commentaire TEXT NOT NULL CHECK (length(commentaire) <= 2000),
  contact TEXT CHECK (contact IS NULL OR length(contact) <= 200),
  ip_hash TEXT,
  statut TEXT NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau','accepte','rejete'))
);

INSERT INTO correction_new (id, recu_le, page, producer_id, champ, valeur_proposee, commentaire, contact, ip_hash, statut)
  SELECT id, recu_le, page, producer_id, champ, valeur_proposee, commentaire, contact, ip_hash, statut FROM correction;

DROP TABLE correction;

ALTER TABLE correction_new RENAME TO correction;

CREATE INDEX correction_statut_recu_le ON correction (statut, recu_le);
CREATE INDEX correction_ip_hash_recu_le ON correction (ip_hash, recu_le);
