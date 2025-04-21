import * as Joi from "joi";

export const envSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  PORT: Joi.number().default(3000),
  SECRET_KEY_JWT: Joi.string().required(),
  ACCOUNT_EMAIL: Joi.string().required(),
  PASSWORD_EMAIL: Joi.string().required(),
  HOST_EMAIL: Joi.string().required(),
  URL_FRONTEND: Joi.string().required()
})