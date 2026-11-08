-- Runs once, when the database is initialised: PostgREST reads the token lifetime from here.
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
