#!/usr/bin/env bash
# Re-encrypts the region's unencrypted copies made before #265 in the bucket: lifeos-<region>-<time>.sql.gz becomes
# <same name>.enc, the plaintext object is deleted only after that. backup.sh does the same after every copy; this one
# needs no database, e.g. to restore an old copy on a new server. Safe to run again.
#
#   ENV_FILE=.env ./migrate-backups.sh && ENV_FILE=.env ./restore.sh lifeos-kz-20261101T030000Z.sql.gz.enc
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
require_s3
require_backup_key

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

migrate_legacy_backups "$work" ||
  die "в s3://$S3_BUCKET/$(backup_prefix)/ остались незашифрованные копии — причины выше"
log "регион $REGION: незашифрованных копий в s3://$S3_BUCKET/$(backup_prefix)/ нет"
