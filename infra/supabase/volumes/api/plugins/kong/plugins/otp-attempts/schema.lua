-- Settings of the `otp-attempts` plugin (handler.lua), as kong.yml gives them.
local typedefs = require "kong.db.schema.typedefs"

return {
  name = "otp-attempts",
  fields = {
    { protocols = typedefs.protocols_http },
    {
      config = {
        type = "record",
        fields = {
          -- How many sign-in attempts one address gets per window, whoever makes them.
          { limit = { type = "integer", required = true, default = 10, gt = 0 } },
          -- The window, seconds: the lifetime of a code (OTP_EXPIRY).
          { window = { type = "integer", required = true, default = 900, gt = 0 } },
          -- Digits in the code of the letter (GOTRUE_MAILER_OTP_LENGTH).
          { otp_length = { type = "integer", required = true, default = 6, between = { 6, 10 } } },
        },
      },
    },
  },
}
