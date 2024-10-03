# Callisto
## Run a local version
To run a local version of Callisto you will first have to create a Discord bot @ https://discord.com/developers/applications

Afterwards create an .env file and fill out all variables except the variables ending in "_PROD" (those are only needed for production setups).

You will also have to create a wallet which will receive the fees from transactions and paste the private key in the .env under CALLISTO_FEE_WALLET_PKEY. For all fee collections to work you will have to create a SOL Token Account @ https://referral.jup.ag/dashboard

Once that's all done you can run "npm install" (if not done yet) and then "npm run dev".