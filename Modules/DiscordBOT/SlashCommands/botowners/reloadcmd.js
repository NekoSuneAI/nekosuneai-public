const { EmbedBuilder, PermissionFlagsBits, ApplicationCommandType, ApplicationCommandOptionType } = require("discord.js");
const glob = require("glob");
const chalk = require("chalk");
const { clientname, clientavatar } = require("../../../../config/config.json");
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const settings = require("../../../../config/config.json");

module.exports = {
    name: "reloadcmd",
    description: "Reload Commands",
    type: ApplicationCommandType.ChatInput,
    toggleOff: false,
    developersOnly: true,
    patreonOnly: false,
    patreonManualWhitelist: [],
    userpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    botpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    options: [],
    run: async (client, interaction, args) => {
    
      client.slashCommands.sweep(() => true);
      glob(`${__dirname}/../**/*.js`, async (err, filePaths) => {
         if (err) return console.log(err);
         filePaths.forEach((file) => {
            delete require.cache[require.resolve(file)];

            const pull = require(file);
            if (pull.name) {
               console.log(
                  chalk.red("✪ ") +
                     chalk.blue(`Reloaded `) +
                     chalk.green(`${pull.name} `) +
                     chalk.blue(`Command`)
               );
               client.slashCommands.set(pull.name, pull);
            }
         });
      });

      const token = settings.clienttoken;
      const clientId = settings.clientid;

      const Guilds = client.guilds.cache.map(guild => guild.id);

        for (const element of Guilds) {
          const rest = new REST({ version: '10' }).setToken(token);
          rest.get(Routes.applicationGuildCommands(clientId, element))
          .then(data => {
            const promises = [];
            for (const command of data) {
                const deleteUrl = `${Routes.applicationGuildCommands(clientId, element)}/${command.id}`;
                promises.push(rest.delete(deleteUrl));
            }
            return Promise.all(promises);
          });
        }

      let reload_embed = new EmbedBuilder()
         .setTitle(`:white_check_mark: | Reloaded All Slash Commands`)
         .setColor("#00FF00")
         //.setFooter(`${clientname}`, `${clientavatar}`)
         .setTimestamp();
         await interaction.reply({ embeds: [reload_embed] });
         
    }
}