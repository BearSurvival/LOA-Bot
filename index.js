require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

// -----------------------------
// Roles allowed to post LOA message 
const allowedRoleIds = [
  '1436508067759001804', // SHS Command
  '1392189768812724379', // PD Gold Command
];

// -----------------------------
// Create client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// -----------------------------
// Slash command registration
const commands = [
  new SlashCommandBuilder()
    .setName('postloa')
    .setDescription('Post the persistent LOA submission message.')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const guildIds = process.env.GUILD_IDS.split(',');

(async () => {
  try {
    console.log('🔁 Registering slash commands in multiple guilds...');
    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands }
      );
      console.log(`✅ Commands registered for guild ${guildId}`);
    }
  } catch (err) {
    console.error(err);
  }
})();

// -----------------------------
// Bot ready
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// -----------------------------
// Interaction handling
client.on('interactionCreate', async interaction => {

  // ---- /postloa Command ----
  if (interaction.isChatInputCommand() && interaction.commandName === 'postloa') {

    if (!interaction.member.roles.cache.some(r => allowedRoleIds.includes(r.id))) {
      return interaction.reply({ content: '❌ You do not have permission to post LOA messages.', ephemeral: true });
    }

    interaction.reply({ content: '✅ Creating LOA message...', ephemeral: true });

    const embed = {
      color: 0x00AE86,
      title: '📝 Leave of Absence (LOA)',
      description: 'Click the dropdown below to submit a Leave of Absence. Fill in your Name (IC) , start and return dates, and reason.',
      footer: { text: 'LOA forms will be reviewed by Command' }
    };

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('selectLOA')
      .setPlaceholder('Submit LOA...')
      .addOptions([
        { label: 'Submit LOA', value: 'submitLOA', description: 'Fill out a leave of absence form.' }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    interaction.channel.send({ embeds: [embed], components: [row] })
      .catch(err => console.error('Failed to send LOA message:', err));
    
    return;
  }

  // ---- Dropdown Selection ----
  if (interaction.isStringSelectMenu() && interaction.customId === 'selectLOA') {
    if (interaction.values[0] === 'submitLOA') {

      const modal = new ModalBuilder()
        .setCustomId(`loaModal_${interaction.user.id}`)
        .setTitle('Submit Leave of Absence');

      const icNameInput = new TextInputBuilder()
        .setCustomId('icName')
        .setLabel('IC Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const startDateInput = new TextInputBuilder()
        .setCustomId('startDate')
        .setLabel('Start Date (DD-MM-YYYY)') 
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const returnDateInput = new TextInputBuilder()
        .setCustomId('returnDate')
        .setLabel('Return Date (DD-MM-YYYY)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for LOA')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(icNameInput),
        new ActionRowBuilder().addComponents(startDateInput),
        new ActionRowBuilder().addComponents(returnDateInput),
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
    }
  }

  // ---- Modal Submission ----
  if (interaction.isModalSubmit() && interaction.customId.startsWith('loaModal_')) {
    const icName = interaction.fields.getTextInputValue('icName');
    const startDate = interaction.fields.getTextInputValue('startDate');
    const returnDate = interaction.fields.getTextInputValue('returnDate');
    const reason = interaction.fields.getTextInputValue('reason');

    const reviewChannel = interaction.guild.channels.cache.find(c => c.name === 'loa-review' && c.isTextBased());
    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'loa-logs' && c.isTextBased());

    if (!reviewChannel) return interaction.reply({ content: '❌ LOA review channel not found.', ephemeral: true });

    const embed = {
      color: 0x00AE86,
      title: `📝 LOA Submission`,
      description: `**Applicant:** <@${interaction.user.id}>`,
      fields: [
        { name: 'IC Name', value: icName },
        { name: 'Start Date', value: startDate },
        { name: 'Return Date', value: returnDate },
        { name: 'Reason', value: reason }
      ],
      footer: { text: 'Staff can approve or deny using the buttons below.' },
      timestamp: new Date()
    };

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('approveLOA').setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('denyLOA').setLabel('Deny').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('moreinfoLOA').setLabel('Request More Info').setStyle(ButtonStyle.Secondary)
      );

    await reviewChannel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Your LOA has been submitted!', ephemeral: true });

    if (logChannel) logChannel.send({ embeds: [embed] });
  }

  // ---- Staff Button Handling ----
  if (interaction.isButton()) {
    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'loa-logs' && c.isTextBased());

    if (!interaction.member.roles.cache.some(r => allowedRoleIds.includes(r.id))) {
      return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
    }

    const messageEmbed = interaction.message.embeds[0];
    const newEmbed = { ...messageEmbed.data };

    if (interaction.customId === 'approveLOA') {
      newEmbed.color = 0x00FF00;
      newEmbed.title = `✅ LOA Approved`;
      await interaction.message.edit({ embeds: [newEmbed], components: [] });
      await interaction.reply({ content: 'LOA approved!', ephemeral: true });
    } 
    else if (interaction.customId === 'denyLOA') {
      newEmbed.color = 0xFF0000;
      newEmbed.title = `❌ LOA Denied`;
      await interaction.message.edit({ embeds: [newEmbed], components: [] });
      await interaction.reply({ content: 'LOA denied.', ephemeral: true });
    } 
    else if (interaction.customId === 'moreinfoLOA') {
      await interaction.reply({ content: 'Request sent to applicant for more information.', ephemeral: true });
    }

    if (logChannel) logChannel.send({ embeds: [newEmbed] });
  }

});

// -----------------------------
// Login
client.login(process.env.DISCORD_TOKEN);