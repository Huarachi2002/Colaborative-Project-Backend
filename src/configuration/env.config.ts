export const EnvConfig = ():any => ({
  enviroment: process.env.NODE_ENV || "dev",
  port: +process.env.PORT || 3000,
  secret_key_jwt: process.env.SECRET_KEY_JWT,
  database_url: process.env.DATABASE_URL,
  account_email: process.env.ACCOUNT_EMAIL,
  pass_email: process.env.PASSWORD_EMAIL,
  host_email: process.env.HOST_EMAIL,
  url_frontend: process.env.URL_FRONTEND
})