# How to add a family story

This file is for Vikas and for Claude chats in the Family tree project. The public guide for relatives is stories/index.html (https://family.erraballi.org/stories/).

## Rules

- Warning: Never publish a story before the subject approves the draft. If the subject has died, one of their children must approve it. Any child can approve.
- Keep phone numbers, email addresses, street addresses and other private details out of the story.
- If the family asks to remove a story, set its status to "draft" in data/stories.json on the same day.

## Files

- data/stories.json: the list of stories. The tree page and the Stories page read this file.
- stories/<name>/index.html: the page frame. It is the same in every story folder.
- stories/<name>/story.md: the story text and a short header.
- stories/<name>/photo-1.jpg (and more): photos for the story.
- stories/template/: the model folder. Copy it for each new story.
- The master sheet "Family tree master (erraballi.org)", tab "Stories": one row for each story, from request to live.

## Procedure

1. Add a row to the "Stories" tab when a relative sends a story, a recording or a memory. Set Status to "requested".
2. Find the person ID in data/people.psv.
3. Copy the folder stories/template/ to stories/<name>/. Use the first name in lower case for <name>, for example stories/pramila/. If that folder exists, add the second name.
4. In stories/<name>/story.md, fill in the header. Set "person" to the person ID.
5. Write the story below the header. Keep the words of the person. Write a translation note in "language" if you translate.
6. Resize each photo to 1600 px on the long side. Remove the photo metadata.
7. Make a private claude.ai artifact of the draft. Send the link to the person who approves.
8. When the approver says yes, write their name in "approved_by" and the date in "approved_on".
9. Add an entry to data/stories.json. Set "url" to "stories/<name>/" and "status" to "live".
10. Push to main. Then open https://family.erraballi.org/stories/<name>/ and the person card on the tree. Make sure that the STORY tag and the "Read the story" link show.
11. Update the row on the "Stories" tab: set Status to "live" and write the URL.

## The header in story.md

- person: the person ID from data/people.psv.
- title: the title of the story.
- kind: "written", "recording", "interview" or "memories".
- told_by: the person who tells the story.
- written_by: the person who wrote it down or recorded it.
- when: the year and month of the recording or text, for example 2026-12.
- language: an optional note, for example "Translated from Telugu".
- approved_by: the person who approved the draft.
- approved_on: the date of approval.

## The story format

- Put a blank line between paragraphs.
- Write "## " before a heading.
- Write "> " before a quote.
- Write "Q: " before an interview question.
- Write ![caption](photo-1.jpg) on its own line for a photo.
- Write "---" on its own line for a break between parts.

## Memories

A memory is a short text about one person from a relative. Keep memories in the "Stories" tab, column Notes, or in a Drive document. When there are three or more memories about one person, make a story page of kind "memories". Put the name of each relative under their memory.
