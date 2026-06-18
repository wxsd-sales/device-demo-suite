import xapi from 'xapi';

const config = {
  name: 'Report Issue',
  submitText: 'Submit Issue',
  waitingText: 'Sending ticket to Helix...',
  showAlert: true,
  // Update this URL to your laptop LAN IP or ngrok URL, e.g. https://abc123.ngrok.io/api/tickets
  serviceUrl: 'https://YOUR_SERVER_HOST/api/tickets',
  allowInsecureHTTPs: true,
  panelId: 'helix-report-issue',
  start: {
    options: [
      'Incoming audio or video issue',
      'Outgoing audio or video issue',
      'Cannot connect to meeting',
      'Content sharing issue',
      'Request on-site technician',
    ],
  },
  form: {
    category: {
      type: {
        Text: {
          prefix: '',
          options: 'size=2;fontSize=normal;align=left',
        },
        Button: {
          name: ['Select Category', 'Change Category'],
          options: 'size=2',
        },
      },
      action: 'Options',
      placeholder: 'Select a category',
      promptText: 'Describe the issue',
      inputType: 'SingleLine',
      showPlaceholder: true,
      visiable: true,
      modifiable: true,
    },
    name: {
      requires: ['category'],
      type: {
        Text: {
          prefix: 'Name:',
          options: 'size=2;fontSize=normal;align=left',
        },
        Button: {
          name: ['Enter Name', 'Change Name'],
          options: 'size=2',
        },
      },
      action: 'TextInput',
      placeholder: 'eg. Jane Smith (optional)',
      promptText: 'Enter your name',
      inputType: 'SingleLine',
      showPlaceholder: true,
      visiable: true,
      modifiable: true,
    },
    submit: {
      requires: ['category'],
      visiable: true,
      modifiable: true,
      action: 'Submit',
      value: 'active',
      type: {
        Button: {
          name: ['Submit Issue'],
          options: 'size=2',
        },
      },
    },
  },
};

let inputs = {};
let identification = {};

function main() {
  xapi.Config.HttpClient.Mode.set('On');
  xapi.Config.HttpClient.AllowInsecureHTTPS.set(config.allowInsecureHTTPs ? 'True' : 'False');

  xapi.Status.SystemUnit.Software.DisplayName.get()
    .then((result) => { identification.software = result; })
    .catch((e) => console.log('Could not get DisplayName: ' + e.message));

  xapi.Status.SystemUnit.Hardware.Module.SerialNumber.get()
    .then((result) => { identification.serialNumber = result; })
    .catch((e) => console.log('Could not get SerialNumber: ' + e.message));

  xapi.Status.SystemUnit.ProductId.get()
    .then((result) => { identification.productId = result; })
    .catch((e) => console.log('Could not get ProductId: ' + e.message));

  xapi.Status.Webex.DeveloperId.get()
    .then((result) => { identification.deviceId = result; })
    .catch((e) => console.log('Could not get Device Id: ' + e.message));

  xapi.Status.UserInterface.ContactInfo.ContactMethod[1].Number.get()
    .then((result) => { identification.contactNumber = result; })
    .catch((e) => console.log('Could not get Contact Number: ' + e.message));

  xapi.Status.UserInterface.ContactInfo.Name.get()
    .then((result) => { identification.contactInfoName = result; })
    .catch((e) => console.log('Could not get Contact Info Name: ' + e.message));

  createPanel();
  xapi.Event.UserInterface.Message.TextInput.Response.on(processInput);
  xapi.Event.UserInterface.Extensions.Widget.Action.on(processWidget);
  xapi.Event.UserInterface.Extensions.Panel.Clicked.on((event) => {
    if (event.PanelId !== config.panelId) return;
    inputs = {};
    createPanel('start');
  });
}

setTimeout(main, 1000);

function processWidget(event) {
  if (event.Type !== 'clicked') return;

  if (config.form.hasOwnProperty(event.WidgetId)) {
    switch (config.form[event.WidgetId].action) {
      case 'TextInput':
        createInput(event.WidgetId);
        break;
      case 'Options':
        createPanel('start');
        break;
      case 'Submit':
        xapi.Command.UserInterface.Extensions.Panel.Close();
        sendInformation();
        break;
      default:
        break;
    }
  } else if (event.WidgetId.startsWith('option')) {
    const option = parseInt(event.WidgetId.slice(-1), 10);
    inputs.category = config.start.options[option];
    createPanel();
  }
}

function createInput(type) {
  const field = config.form[type];
  const parameters = {
    FeedbackId: type,
    InputType: field.inputType,
    Placeholder: field.placeholder,
    Text: field.promptText,
    Title: config.name,
  };
  if (inputs.hasOwnProperty(type)) {
    parameters.InputText = inputs[type];
  }
  xapi.Command.UserInterface.Message.TextInput.Display(parameters);
}

function processInput(event) {
  if (config.form.hasOwnProperty(event.FeedbackId)) {
    inputs[event.FeedbackId] = event.Text;
  }
  createPanel();
}

function alert(title, message, duration) {
  if (!config.showAlert && !duration) return;
  xapi.Command.UserInterface.Message.Alert.Display({
    Duration: duration || 3,
    Text: message,
    Title: title,
  });
}

function parseJSON(inputString) {
  if (!inputString) return false;
  try {
    return JSON.parse(inputString);
  } catch (e) {
    return false;
  }
}

async function sendInformation() {
  alert('Sending', config.waitingText, 10);
  inputs.identification = identification;
  inputs.bookingId = await getBookingId();
  inputs.callDetails = await getCallDetails();
  inputs.conferenceDetails = await getConferenceDetails();
  inputs.submittedAt = new Date().toISOString();

  xapi.Command.HttpClient.Post(
    {
      AllowInsecureHTTPS: true,
      Header: ['Content-Type: application/json'],
      ResultBody: 'PlainText',
      Url: config.serviceUrl,
    },
    JSON.stringify(inputs),
  )
    .then((result) => {
      const body = parseJSON(result.Body);
      const ticketId = body && body.ticketId ? body.ticketId : '';
      alert('Success', ticketId ? `Ticket ${ticketId} created` : 'Ticket submitted to Helix', 10);
    })
    .catch((err) => {
      alert('Error', 'Could not submit ticket. Check server URL.');
      console.log(JSON.stringify(err));
    });
}

function getCallDetails() {
  return xapi.Status.Call.get().then((result) => ((result.length > 0) ? result[0] : null));
}

function getConferenceDetails() {
  return xapi.Status.Conference.Call.get().then((result) => ((result.length > 0) ? result : null));
}

function getBookingId() {
  return xapi.Status.Bookings.Current.Id.get().then((result) => ((result === '') ? null : result));
}

function arrayContains(array, contains) {
  return contains.every((element) => array.indexOf(element) !== -1);
}

function createPanel(state) {
  function createWidget(key, type, name, options) {
    return `<Widget>
        <WidgetId>${key}</WidgetId>
        <Name>${name}</Name>
        <Type>${type}</Type>
        <Options>${options}</Options>
      </Widget>`;
  }

  let fields = '';
  const active = {};

  if (state === 'start') {
    const prompt = createWidget('category-text', 'Text', 'Select an issue category:', 'size=3;fontSize=normal;align=center');
    fields = fields.concat(`<Row><Name>prompt</Name>${prompt}</Row>`);
    config.start.options.forEach((option, i) => {
      const widget = createWidget(`option${i}`, 'Button', option, 'size=4');
      fields = fields.concat(`<Row><Name>option${i}</Name>${widget}</Row>`);
    });
  } else {
    for (const [key, field] of Object.entries(config.form)) {
      if (!field.modifiable) inputs[key] = field.placeholder;
      if (!field.visiable || !field.hasOwnProperty('type')) continue;
      if (field.hasOwnProperty('requires') && !arrayContains(Object.keys(inputs), field.requires)) continue;
      if (field.hasOwnProperty('value')) active[key] = field.value;

      let widgets = '';
      for (const [type, widget] of Object.entries(field.type)) {
        if (type === 'Button') {
          widgets = widgets.concat(createWidget(key, type, inputs.hasOwnProperty(key) ? widget.name[1] : widget.name[0], widget.options));
        } else if (type === 'Text' && (inputs.hasOwnProperty(key) || field.showPlaceholder)) {
          widgets = widgets.concat(createWidget(`${key}-text`, type, inputs.hasOwnProperty(key) ? `${widget.prefix} ${inputs[key]}` : field.placeholder, widget.options));
        }
      }
      fields = fields.concat(`<Row><Name>${key}</Name>${widgets}</Row>`);
    }
  }

  const panel = `
    <Extensions>
      <Panel>
        <Location>HomeScreenAndCallControls</Location>
        <Type>Statusbar</Type>
        <Icon>Helpdesk</Icon>
        <Name>${config.name}</Name>
        <Color>#0067ac</Color>
        <ActivityType>Custom</ActivityType>
        <Page>
          <Name>${config.name}</Name>
          ${fields}
          <Options>hideRowNames=1</Options>
        </Page>
      </Panel>
    </Extensions>`;

  xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: config.panelId }, panel)
    .catch((err) => console.log('Panel.Save error: ' + JSON.stringify(err)));

  for (const [key, value] of Object.entries(active)) {
    xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: value, WidgetId: key })
      .catch((err) => console.log('Widget.SetValue error: ' + JSON.stringify(err)));
  }
}
