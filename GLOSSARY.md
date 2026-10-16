# AI Office

A local, visual control room for coding agents working across the projects in `C:\Projects\personal`: each project is a room, each running agent is a character at a desk.

## Language

**Office**:
The whole floor: every Room, seen together.
_Avoid_: Dashboard, workspace

**Room**:
One Project shown in the Office.
_Avoid_: Space, area

**Project**:
A git repository under `C:\Projects\personal` that the Office can send agents into.
_Avoid_: Repo, app

**Thread**:
One agent conversation working on one task inside one Project, from its first prompt until it is stopped or finished.
_Avoid_: Session, job, run, agent

**Subagent**:
A helper agent a Thread spawns to do part of its task; it belongs to that Thread and ends when its part is done.
_Avoid_: Child thread, sub-thread, worker

**Character**:
The figure at a desk that stands for one Thread.
_Avoid_: Avatar, worker, bot

**Needs-you**:
The state of a Thread that cannot continue until the user answers it, such as a permission request or a question.
_Avoid_: Blocked, waiting, paused

**Base branch**:
The branch of a Project that a Thread starts from and is compared against; chosen when the Thread is started, defaulting to the Project's default branch.
_Avoid_: Parent branch, target

**Queued**:
The state of a Thread that has been started but is waiting at its Room's door because every running slot is taken.
_Avoid_: Pending, scheduled

**Idle**:
The state of a Thread that has finished its turn and is waiting for the user's next message; it holds no running slot.
_Avoid_: Paused, sleeping

**Done**:
The final state of a Thread the user has marked as finished.
_Avoid_: Completed, closed

**Stopped**:
The final state of a Thread the user has ended before it was finished.
_Avoid_: Killed, cancelled

**Failed**:
The state of a Thread that hit an error; it can be retried or ended.
_Avoid_: Crashed, errored
