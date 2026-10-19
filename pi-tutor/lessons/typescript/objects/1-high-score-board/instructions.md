# Instructions

In this exercise, you are implementing a way to keep track of the high scores for the most popular game in your local arcade hall.

You have 5 functions to implement, mostly related to manipulating an object that holds high scores.

## 1. Create a new high score board

Create a function `createScoreBoard` that creates an object that serves as a high score board.
The keys of this object will be the names of the players, the values will be their scores.
For testing purposes, you want to directly include one entry in the object.
This initial entry should consist of `The Best Ever` as player name and `1000000` as score.

```javascript
createScoreBoard();
// returns an object with one initial entry
```

## 2. Add players to a score board

To add a player to the high score board, define the function `addPlayer`.
It accepts 3 parameters:

- The first parameter is an existing score board object.
- The second parameter is the name of a player as a string.
- The third parameter is the score as a number.

The function returns the same score board object that was passed in after adding the new player.

```javascript
addPlayer({ 'Dave Thomas': 0 }, 'José Valim', 486373);
// => {'Dave Thomas': 0, 'José Valim': 486373}
```

## 3. Remove players from a score board

If players violate the rules of the arcade hall, they are manually removed from the high score board.
Define `removePlayer` which takes 2 parameters:

- The first parameter is an existing score board object.
- The second parameter is the name of the player as a string.

This function should remove the entry for the given player from the board and return the board afterwards.
If the player was not on the board in the first place, nothing should happen to the board.
It should be returned as is.

```javascript
removePlayer({ 'Dave Thomas': 0 }, 'Dave Thomas');
// => {}

removePlayer({ 'Dave Thomas': 0 }, 'Rose Fanaras');
// => { 'Dave Thomas': 0 }
```

## 4. Increase a player's score

If a player finishes another game at the arcade hall, a certain amount of points will be added to the previous score on the board.
Implement `updateScore`, which takes 3 parameters:

- The first parameter is an existing score board object.
- The second parameter is the name of the player whose score should be increased.
- The third parameter is the score that you wish to **add** to the stored high score.

The function should return the score board after the update was done.

```javascript
updateScore({ 'Freyja Ćirić': 12771008 }, 'Freyja Ćirić', 73);
// => {"Freyja Ćirić", 12771081}
```

## 5. Apply Monday bonus points

The arcade hall keeps a separate score board on Mondays.
At the end of the day, each player on that board gets 100 additional points.

Implement the function `applyMondayBonus` that accepts a score board.
The function adds the bonus points for each player that is listed on that board.
Afterwards, the board is returned.

```javascript
const scoreBoard = {
  'Dave Thomas': 44,
  'Freyja Ćirić': 539,
  'José Valim': 265,
};

applyMondayBonus(scoreBoard);
// => { 'Dave Thomas': 144, 'Freyja Ćirić': 639, 'José Valim': 365 }
```

## Hints

## 1. Create a new high score board

- Create a new object using curly brackets.
- Write the key as a string so the key can contain spaces.
- Separate key and value using a colon.

## 2. Add players to a score board

- Use bracket notation to add a key with a name that is stored in a variable (the argument).
- Use the assignment operator (`=`) to set a value for the new key.
- Return the score board parameter after you added the player.

## 3. Remove players from a score board

- Use the [delete operator][mdn-delete].
- Reference the key like you have done in the task before (bracket notation).

## 4. Increase a player's score

- First think about how to express the new value that you want to assign.
- Then use the assignment operator like in task 2 to set that new value.
- If you have not done so already, you can make use of the [shorthand assignment operator][mdn-shorthand-assignment] `+=`.

## 5. Apply Monday bonus points

- Use a `for...in` loop to go through all keys in the object.
- For each key, set the new value as you did in task 4.

[mdn-delete]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/delete
[mdn-shorthand-assignment]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Addition_assignment
[mdn-for-in]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in
