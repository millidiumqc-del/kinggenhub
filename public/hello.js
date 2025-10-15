exports.handler = async function(event, context) {
  // On essaie de lire les deux variables les plus critiques
  const botToken = process.env.BOT_TOKEN;
  const dbUrl = process.env.DATABASE_URL;

  const responseBody = {
    message: "Vérification des variables d'environnement.",
    isBotTokenPresent: !!botToken,
    botTokenPreview: botToken ? botToken.substring(0, 5) + "..." : "NON TROUVÉ",
    isDbUrlPresent: !!dbUrl,
    dbUrlPreview: dbUrl ? dbUrl.substring(0, 20) + "..." : "NON TROUVÉ"
  };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(responseBody, null, 2)
  };
};
