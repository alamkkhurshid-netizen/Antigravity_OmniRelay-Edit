# WhatsApp interactive-message checkpoint

OmniRelay keeps one booking state machine and upgrades only its presentation layer.

- Menus containing up to 10 choices use a Meta interactive list.
- Confirm/decline choices use Meta reply buttons (maximum 3).
- Busy slot lists are paginated into selectable WhatsApp lists with up to eight times plus Previous/More controls, so no valid option is hidden.
- Reply IDs remain the existing numeric state-machine inputs; no duplicate booking logic is introduced.
- Stored message content uses `type: data`, `kind: interactive`; the existing message constraint and inbound webhook already support this representation.
- The WhatsApp dispatcher converts this stored content into a Cloud API `interactive` payload.
- `MENU`, `START`, `STOP`, typed numbers, and human handoff remain available as accessibility and recovery paths.
