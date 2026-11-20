-- Sends one message from Microsoft Outlook for Mac (called by send-reports-mac.js).
-- Usage: osascript send-outlook-mac.applescript <subject> <html body> <email address>
on run argv
	set theSubject to item 1 of argv
	set theHtml to item 2 of argv
	set theAddress to item 3 of argv
	tell application "Microsoft Outlook"
		set theMessage to make new outgoing message with properties {subject:theSubject, content:theHtml}
		make new to recipient at theMessage with properties {email address:{address:theAddress}}
		send theMessage
	end tell
	return "ok"
end run
