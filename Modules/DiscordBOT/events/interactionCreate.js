const client = require("../index");
const i18n = require("i18n");
const ms = require("ms");
const { EmbedBuilder } = require("discord.js");
const main_cfg = require("../config/settings.json");

i18n.setLocale("en");

client.on("interactionCreate", async (interaction) => {
    // ———————————————[Slash Commands]———————————————
    if (interaction.isCommand()) {
        // Get the command object
        const cmd = client.slashCommands.get(interaction.commandName.toLowerCase());
        if (!cmd) {
    		console.error(`Command "${interaction.commandName}" not found.`);
    		return interaction.reply({
        		content: "An error has occurred. Command not found. ❌",
        		ephemeral: true,
    		});
		}

        const args = [];

        // Parse arguments from the interaction options
        for (let option of interaction.options.data) {
            if (option.type === "SUB_COMMAND") {
                if (option.name) args.push(option.name);
                option.options?.forEach((x) => {
                    if (x.value) args.push(x.value);
                });
            } else if (option.value) args.push(option.value);
        }

        // Get the member from the guild
        interaction.member = interaction.guild.members.cache.get(interaction.user.id);

        // Check voice channel conditions for commands requiring voice channel interaction
        if (cmd.voiceChannel) {
            if (!interaction.member.voice.channel) {
                return interaction.followUp({ content: `You are not connected to an audio channel. ❌`, ephemeral: true });
            }
            if (interaction.guild.me.voice.channel && interaction.member.voice.channel.id !== interaction.guild.me.voice.channel.id) {
                return interaction.followUp({ content: `You are not on the same audio channel as me. ❌`, ephemeral: true });
            }
        }

        // Check if the command is toggled off
        if (cmd.toggleOff) {
            let toggleoff_embed = new EmbedBuilder()
                .setTitle(`:x: | That Command Has Been Disabled By The Developers! Please Try Later.`)
                .setColor(0x0099FF)
                .setTimestamp();
            return interaction.reply({ embeds: [toggleoff_embed] });
        }

        // Permission checks
        if (!interaction.member.permissions.has(cmd.userpermissions || [])) {
            let userperms_embed = new EmbedBuilder()
                .setTitle(`:x: | You Don't Have Permissions To Use The Command!`)
                .setColor(0x0099FF)
                .setTimestamp();
            return interaction.reply({ embeds: [userperms_embed] });
        }

        if (!interaction.guild.members.me.permissions.has(cmd.botpermissions || [])) {
            let botperms_embed = new EmbedBuilder()
                .setTitle(`:x: | I Don't Have Permissions To Use The Command!`)
                .setColor(0x0099FF)
                .setTimestamp();
            return interaction.reply({ embeds: [botperms_embed] });
        }

        // Check if the command is restricted to developers
        if (cmd.developersOnly) {
            if (!main_cfg.discord.developerID.includes(interaction.member.id)) {
                let developersOnly_embed = new EmbedBuilder()
                    .setTitle(`:x: | Only Developers Can Use That Command!`)
                    .setDescription(`Developers: ${main_cfg.discord.developerID.map((v) => `<@${v}>`).join(",")}`)
                    .setColor(0x0099FF)
                    .setTimestamp();
                return interaction.reply({ embeds: [developersOnly_embed] });
            }
        }

        // Cooldown check
        if (cmd.cooldowns) {
            const cooldownKey = `${cmd.name}${interaction.member.id}`;
            if (client.cooldowns.has(cooldownKey)) {
                let cooldown_embed = new EmbedBuilder()
                    .setTitle(`${main_cfg.discord.randomMessages_Cooldown[Math.floor(Math.random() * main_cfg.discord.randomMessages_Cooldown.length)]}`)
                    .setDescription(`You need to wait \`${ms(client.cooldowns.get(cooldownKey) - Date.now(), { long: true })}\` to use \`/${cmd.name}\` again!`)
                    .setColor(0x0099FF)
                    .setTimestamp();
                return interaction.reply({ embeds: [cooldown_embed] });
            }

            client.cooldowns.set(cooldownKey, Date.now() + cmd.cooldowns);
            setTimeout(() => {
                client.cooldowns.delete(cooldownKey);
            }, cmd.cooldowns);
        }

        try {
    		// Run the command
    		await cmd.run(client, interaction, args);
		} catch (error) {
    		console.error(`Error executing command "${interaction.commandName}":`, error);
    		// Send an error message to the user
    		return interaction.reply({
        		content: "An unexpected error occurred while executing this command. ❌",
        		ephemeral: true,
    		});
		}
    }

    // ———————————————[Buttons]———————————————
    if (interaction.isButton()) {
        // Handle button interaction logic here
    }

    // ———————————————[Select Menu]———————————————
    if (interaction.isStringSelectMenu()) {
        // Handle select menu interaction logic here
    }

    // ———————————————[Context Menu]———————————————
    if (interaction.isUserContextMenuCommand()) {
        await interaction.deferReply({ ephemeral: false });
        const command = client.slashCommands.get(interaction.commandName);
        if (command) command.run(client, interaction);
    }
});