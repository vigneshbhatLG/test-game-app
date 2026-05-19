# DeepLink Test game app 
This is for testing PC tool. 

Once after adding and setting up tv in PC tool :

run:
ares-package <file_name>

ares-install -d <device_name> <file_name.ipk>

Add com.game.gamepac --> AppId

Add Level1->level5 --> contentId (which ever levels you want to fire to webostv)

# Configuration in PC tool Before you add the game

1. In file TestDevicePopup.jsx 

Pathh --> deep-link-pc-tool/app/src/components/TestDevicePopup/TestDevicePopup.js

Lines: 115–128

## It's in key value format:

const escapedContentId = contentId.replace(/"/g, '\\"');

...

const command = `ares-launch --device "${deviceName}" -c "${appId}" ; ares-launch --device "${deviceName}" "${appId}" -p "contentId=${escapedContentId}"`;


## Change it to:

const jsonParams = JSON.stringify({ contentId });

const cmdEscapedParams = jsonParams.replace(/"/g, '\\"');

...

const command = `ares-launch --device "${deviceName}" "${appId}" && ares-launch --device "${deviceName}" "${appId}" -p "${cmdEscapedParams}"`;

The JSON format ({"contentId":"level3"}) is required because ares-launch -p only accepts JSON, not key=value pairs.
