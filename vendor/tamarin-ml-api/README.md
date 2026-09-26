## Tamarin Prover Extension for the "Less Effort, Shorter Proofs" Paper

This is a fork of the main Tamarin repository (forked from the commit `bb1a083f6092f5827c8bea6980caf5927578b9df`) that extends it with an API for reinforcement learning, as described in the paper.

The changes relevant to our API are in the `./src/Web` directory. Throughout the rest of repository we also made minor changes where necessary, for instance, for the pretty-printing of proof methods for our RL agent.

To build it, it requires the same dependencies as the original Tamarin, see the [main repository](https://github.com/tamarin-prover/tamarin-prover/tree/develop) for information on the dependencies and how to compile it.
Once built, the Tamarin executable is available in your path as `tamarin-prover-json` and can be used.

Note that our changes to the API break Tamarin's GUI. Thus, if you want to use Tamarin's GUI, we recommend building this repository's `develop` branch (or Tamarin from the main repository). Once our paper is published and we have corresponded with the Tamarin prover's maintainers, we plan to upstream our changes to Tamarin's main repository without breaking its GUI, making them available for everyone.

In the `./scripts` folder, you can find the `examples.py` file which shows how our API functions, and how it can be used to implement a greedy proof search using BFS to traverse the proof tree.