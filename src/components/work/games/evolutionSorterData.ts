// Vendored data for the Evolution Sorter mini-game (EvolutionSorter.astro).
//
// Source: the Map of Evolution project (github.com/avan36/MapOfEvolution, live
// at avan36.github.io/MapOfEvolution). Names, scientific names, emoji and facts
// come from its data/tree/*.json files: `fact` is one of the node's facts
// (lightly trimmed), `what` is its summary cut to one line, and a few emoji are
// swapped where the original was a pun that would mislead (the platypus was a
// duck). Branch blurbs follow data/groups.json. Each
// organism's `branch` was worked out from its line of ancestors in that tree:
// birds = Neornithes, mammals = Mammalia, amphibians = Lissamphibia, reptiles =
// the rest of Sauropsida, fish = vertebrates outside Tetrapoda, insects =
// Insecta, other invertebrates = the rest of Animalia, plants = land plants,
// fungi = Fungi.

export type BranchId =
  | 'plants'
  | 'fungi'
  | 'insects'
  | 'inverts'
  | 'fish'
  | 'amphibians'
  | 'mammals'
  | 'reptiles'
  | 'birds';

export type Branch = { id: BranchId; label: string; emoji: string; blurb: string };

/** Tips of the simplified tree, left to right in the order they're drawn. */
export const BRANCHES: Branch[] = [
  { id: 'plants', label: 'Plants', emoji: '🌿', blurb: 'From mosses to towering trees, flowers and fruit.' },
  { id: 'fungi', label: 'Fungi', emoji: '🍄', blurb: 'Mushrooms, moulds and yeasts: closer kin to animals than to plants.' },
  { id: 'insects', label: 'Insects', emoji: '🐝', blurb: 'Six legs, three body parts, and most of the animal species on Earth.' },
  { id: 'inverts', label: 'Other invertebrates', emoji: '🐙', blurb: 'Every other animal without a backbone: spiders, crabs, octopuses, worms, jellies.' },
  { id: 'fish', label: 'Fish', emoji: '🐟', blurb: 'The first animals with backbones, and every fish swimming today.' },
  { id: 'amphibians', label: 'Amphibians', emoji: '🐸', blurb: 'Frogs, salamanders and caecilians: the first four-legged animals on land.' },
  { id: 'mammals', label: 'Mammals', emoji: '🐘', blurb: 'Furry, milk-making animals, from platypuses to whales.' },
  { id: 'reptiles', label: 'Reptiles', emoji: '🦎', blurb: 'Lizards, snakes, turtles, crocodiles and the tuatara.' },
  { id: 'birds', label: 'Birds', emoji: '🐦', blurb: 'The dinosaurs that survived. Every bird alive is a living dinosaur.' },
];

/**
 * The simplified tree as nested pairs, for drawing: each inner array is a
 * split, leaves are branch ids. (Plants, (Fungi, (Invertebrates, (Fish,
 * (Amphibians, (Mammals, (Reptiles, Birds))))))).
 */
export type Clade = BranchId | Clade[];
export const TREE: Clade = ['plants', ['fungi', [['insects', 'inverts'], ['fish', ['amphibians', ['mammals', ['reptiles', 'birds']]]]]]];

export type Species = {
  id: string;
  name: string;
  scientific?: string;
  emoji: string;
  branch: BranchId;
  /** One line from Map of Evolution on what it is. */
  what: string;
  /** A fun fact, shown after placing it. */
  fact: string;
};

export const SPECIES: Species[] = [
  // ---- Mammals ----
  { id: 'platypus', name: 'Platypus', scientific: 'Ornithorhynchus anatinus', emoji: '🦫', branch: 'mammals', what: 'A duck-billed, otter-footed, egg-laying mammal from eastern Australia.', fact: 'When the first specimen reached Britain in 1799, some scientists suspected it was a hoax stitched together from different animals.' },
  { id: 'blue-whale', name: 'Blue whale', scientific: 'Balaenoptera musculus', emoji: '🐳', branch: 'mammals', what: 'The largest animal known to have ever lived, bigger than any dinosaur.', fact: 'In feeding season a blue whale can eat around 16 tonnes of krill a day.' },
  { id: 'bats', name: 'Bats', scientific: 'Chiroptera', emoji: '🦇', branch: 'mammals', what: 'The only mammals that can truly fly: about a fifth of all mammal species.', fact: 'Vampire bats share blood meals with hungry roost-mates — and remember who has helped them before.' },
  { id: 'orca', name: 'Orca', scientific: 'Orcinus orca', emoji: '🐬', branch: 'mammals', what: 'The killer whale is really the largest dolphin.', fact: "Different orca populations have their own diets, hunting tricks and 'dialects' — a form of culture." },
  { id: 'pangolins', name: 'Pangolins', scientific: 'Pholidota', emoji: '🌰', branch: 'mammals', what: 'The only mammals covered in scales, made of keratin like your fingernails.', fact: "A pangolin's tongue can be longer than its body when fully extended, and is anchored deep in its chest." },
  { id: 'koala', name: 'Koala', scientific: 'Phascolarctos cinereus', emoji: '🐨', branch: 'mammals', what: 'A tree-dwelling marsupial that eats almost nothing but eucalyptus leaves.', fact: 'Koala fingerprints are so similar to human ones that they are hard to tell apart.' },
  { id: 'sirenia', name: 'Manatees & dugongs', scientific: 'Sirenia', emoji: '🌊', branch: 'mammals', what: "Slow, gentle 'sea cows' whose closest living relatives are elephants.", fact: "Sailors' mermaid tales may have been inspired by these animals — the order is named after the Sirens of Greek myth." },
  { id: 'armadillos', name: 'Armadillos', scientific: 'Cingulata', emoji: '🛡️', branch: 'mammals', what: 'Armoured mammals whose shells are bony plates that grow in their skin.', fact: 'The nine-banded armadillo almost always gives birth to four identical quadruplets, all from a single egg.' },
  { id: 'hedgehogs', name: 'Hedgehogs', scientific: 'Erinaceidae', emoji: '🦔', branch: 'mammals', what: 'Spiny insect-eaters covered in around 5,000–7,000 hollow spines.', fact: "They sometimes 'self-anoint', chewing strange substances into a froth and spreading it on their spines — nobody is quite sure why." },
  // ---- Birds ----
  { id: 'penguins', name: 'Penguins', scientific: 'Sphenisciformes', emoji: '🐧', branch: 'birds', what: "Flightless seabirds that 'fly' underwater with stiff flipper-wings.", fact: 'Emperor penguins can dive over 500 metres deep and hold their breath for more than 25 minutes.' },
  { id: 'ostrich', name: 'Ostrich', scientific: 'Struthio camelus', emoji: '🪶', branch: 'birds', what: 'The largest living bird, up to 2.7 metres tall.', fact: 'Its eye is bigger than its brain.' },
  { id: 'kiwi', name: 'Kiwi', scientific: 'Apteryx', emoji: '🥝', branch: 'birds', what: 'Small, nocturnal, flightless birds from New Zealand with hair-like feathers.', fact: 'The kiwifruit was named after the bird, not the other way round.' },
  { id: 'hummingbirds', name: 'Hummingbirds', scientific: 'Trochilidae', emoji: '🌺', branch: 'birds', what: 'Tiny nectar drinkers that hover by beating their wings in a figure-of-eight.', fact: 'The bee hummingbird of Cuba weighs about 2 grams, the smallest bird in the world.' },
  { id: 'chicken', name: 'Chicken', scientific: 'Gallus gallus domesticus', emoji: '🐔', branch: 'birds', what: "The world's most numerous bird: a domesticated red junglefowl.", fact: 'Chickens are living dinosaurs: they share a common ancestor with T. rex and Velociraptor that lived over 160 million years ago.' },
  { id: 'owls', name: 'Owls', scientific: 'Strigiformes', emoji: '🦉', branch: 'birds', what: 'Silent night hunters with forward-facing eyes and super-sensitive hearing.', fact: 'Barn owls have one ear higher than the other, which lets them pinpoint a mouse in total darkness.' },
  // ---- Reptiles ----
  { id: 'tuatara', name: 'Tuatara', scientific: 'Sphenodon punctatus', emoji: '🦎', branch: 'reptiles', what: "A New Zealand reptile that looks like a lizard but isn't one.", fact: "Young tuatara have a light-sensitive 'third eye' on top of the head, which becomes covered by scales as they grow." },
  { id: 'komodo-dragon', name: 'Komodo dragon', scientific: 'Varanus komodoensis', emoji: '🐉', branch: 'reptiles', what: 'The largest living lizard, up to 3 metres long.', fact: 'Its teeth have edges coated in iron, which keeps them sharp.' },
  { id: 'sea-turtles', name: 'Sea turtles', scientific: 'Chelonioidea', emoji: '🐢', branch: 'reptiles', what: 'Turtles with flippers that cross whole oceans.', fact: 'The temperature of the sand decides whether eggs hatch as males or females: warmer nests make more females.' },
  { id: 'alligator', name: 'American alligator', scientific: 'Alligator mississippiensis', emoji: '🐊', branch: 'reptiles', what: 'A broad-snouted crocodilian of south-eastern US swamps.', fact: 'In freezing weather alligators poke their snouts up through the ice so they can keep breathing.' },
  { id: 'king-cobra', name: 'King cobra', scientific: 'Ophiophagus hannah', emoji: '🐍', branch: 'reptiles', what: "The world's longest venomous snake, reaching over 5 metres.", fact: 'It is the only snake known to build a nest of leaves for its eggs, and the female guards it.' },
  { id: 'chameleons', name: 'Chameleons', scientific: 'Chamaeleonidae', emoji: '🦎', branch: 'reptiles', what: 'Slow-moving tree lizards with turret eyes and a ballistic tongue.', fact: 'Each eye moves on its own, so a chameleon can look forwards and backwards at the same time.' },
  // ---- Amphibians ----
  { id: 'axolotl', name: 'Axolotl', scientific: 'Ambystoma mexicanum', emoji: '🦎', branch: 'amphibians', what: 'A smiling Mexican salamander that never grows up and keeps its feathery gills.', fact: "Its genome is about ten times bigger than a human's." },
  { id: 'caecilians', name: 'Caecilians', scientific: 'Gymnophiona', emoji: '🪱', branch: 'amphibians', what: 'Legless, burrowing amphibians that look like giant earthworms.', fact: "In some species, babies feed by peeling off and eating their mother's outer layer of skin." },
  { id: 'poison-dart-frogs', name: 'Poison dart frogs', scientific: 'Dendrobatidae', emoji: '🐸', branch: 'amphibians', what: 'Tiny, brilliantly coloured rainforest frogs with powerful skin toxins.', fact: 'They get their poison from the ants and mites they eat, so frogs raised in captivity are harmless.' },
  { id: 'giant-salamander', name: 'Chinese giant salamander', scientific: 'Andrias davidianus', emoji: '🐉', branch: 'amphibians', what: 'Among the largest amphibians on Earth, up to about 1.8 metres long.', fact: "In Chinese it's called 'baby fish' because its calls sound like a crying baby." },
  { id: 'toads', name: 'Toads', scientific: 'Bufonidae', emoji: '🐸', branch: 'amphibians', what: 'Frogs with dry, warty skin and short legs that walk as much as hop.', fact: "You can't catch warts from touching a toad." },
  // ---- Fish ----
  { id: 'seahorses', name: 'Seahorses', scientific: 'Hippocampus', emoji: '🐴', branch: 'fish', what: 'Upright-swimming fish with a horse-like head and a grasping tail.', fact: 'In seahorses it is the father that gets pregnant and gives birth.' },
  { id: 'whale-shark', name: 'Whale shark', scientific: 'Rhincodon typus', emoji: '🦈', branch: 'fish', what: 'The largest fish alive, longer than a bus, yet it eats only plankton.', fact: 'Whale sharks have tiny teeth covering their eyeballs.' },
  { id: 'eels', name: 'Eels', scientific: 'Anguilliformes', emoji: '🐍', branch: 'fish', what: 'Snake-shaped fish of rivers, reefs and the deep sea.', fact: 'Aristotle thought eels grew out of mud.' },
  { id: 'lampreys', name: 'Lampreys', scientific: 'Petromyzontiformes', emoji: '⭕', branch: 'fish', what: 'Eel-like jawless fish with a round sucker mouth full of rasping teeth.', fact: "A medieval chronicler wrote that King Henry I of England died from eating 'a surfeit of lampreys' in 1135." },
  { id: 'anglerfish', name: 'Anglerfish', scientific: 'Lophiiformes', emoji: '🎣', branch: 'fish', what: 'Fish that fish, with a glowing lure on a fin spine.', fact: 'In some deep-sea anglerfish, the tiny male bites the female and permanently fuses to her body.' },
  { id: 'salmon', name: 'Salmon & trout', scientific: 'Salmonidae', emoji: '🍣', branch: 'fish', what: 'Powerful fish that hatch in rivers, grow up at sea, then fight their way back upstream.', fact: 'Salmon flesh is pink because of pigments from the krill and shrimp they eat.' },
  // ---- Insects ----
  { id: 'silverfish', name: 'Silverfish', scientific: 'Zygentoma', emoji: '🐟', branch: 'insects', what: 'Shiny, wingless insects from a lineage that split off before insects learned to fly.', fact: 'They can live up to eight years and survive months without food.' },
  { id: 'butterflies', name: 'Butterflies & moths', scientific: 'Lepidoptera', emoji: '🦋', branch: 'insects', what: 'Insects with wings covered in tiny coloured scales.', fact: 'Fossil wing scales show moths existed before flowers did.' },
  { id: 'ants', name: 'Ants', scientific: 'Formicidae', emoji: '🐜', branch: 'insects', what: 'Social insects that live in colonies of up to millions. They descend from wasps.', fact: 'All the ants together outweigh all wild birds and wild mammals combined.' },
  { id: 'honeybee', name: 'Honeybee', scientific: 'Apis mellifera', emoji: '🐝', branch: 'insects', what: 'A social bee living in colonies of tens of thousands.', fact: 'A worker bee makes only about a twelfth of a teaspoon of honey in its whole life.' },
  { id: 'dragonflies', name: 'Dragonflies', scientific: 'Odonata', emoji: '🪰', branch: 'insects', what: 'Aerial hunters that can hover, fly backwards and snatch prey in mid-air.', fact: 'In lab tests dragonflies caught about 95% of the prey they chased.' },
  { id: 'mosquitoes', name: 'Mosquitoes', scientific: 'Culicidae', emoji: '🦟', branch: 'insects', what: 'Small flies whose females drink blood to make their eggs.', fact: 'Only female mosquitoes bite; males drink nectar.' },
  // ---- Other invertebrates ----
  { id: 'spiders', name: 'Spiders', scientific: 'Araneae', emoji: '🕷️', branch: 'inverts', what: 'Silk-spinning, eight-legged predators found on every continent except Antarctica.', fact: "The silk of Darwin's bark spider is tougher than Kevlar." },
  { id: 'octopuses', name: 'Octopuses', scientific: 'Octopoda', emoji: '🐙', branch: 'inverts', what: 'Eight-armed escape artists and puzzle solvers.', fact: "About two-thirds of an octopus's neurons are in its arms, which can taste what they touch." },
  { id: 'crabs', name: 'Crabs', scientific: 'Brachyura', emoji: '🦀', branch: 'inverts', what: 'Crustaceans famous for walking sideways.', fact: "The crab body shape evolved independently at least five times — biologists call it 'carcinisation'." },
  { id: 'horseshoe-crabs', name: 'Horseshoe crabs', scientific: 'Xiphosura', emoji: '🛡️', branch: 'inverts', what: 'Not crabs at all but armoured cousins of spiders.', fact: 'Their blue blood is used to test vaccines and medicines for dangerous bacterial toxins.' },
  { id: 'immortal-jellyfish', name: 'Immortal jellyfish', scientific: 'Turritopsis dohrnii', emoji: '♾️', branch: 'inverts', what: 'A tiny jellyfish that can turn back into a baby polyp and start life again.', fact: 'It is a hydrozoan, a cousin of Hydra, not a true jellyfish.' },
  { id: 'krill', name: 'Krill', scientific: 'Euphausiacea', emoji: '🦐', branch: 'inverts', what: 'Finger-length, shrimp-like swarmers that feed whales, penguins and seals.', fact: 'Krill glow with their own blue-green light.' },
  { id: 'earthworms', name: 'Earthworms', scientific: 'Crassiclitellata', emoji: '🪱', branch: 'inverts', what: 'Underground ploughs that eat soil and leave behind rich, airy earth.', fact: "Charles Darwin's last book, in 1881, was all about earthworms." },
  { id: 'scorpions', name: 'Scorpions', scientific: 'Scorpiones', emoji: '🦂', branch: 'inverts', what: 'Arachnids with grasping pincers and a venomous sting.', fact: 'Scorpions glow blue-green under ultraviolet light.' },
  // ---- Plants ----
  { id: 'bananas', name: 'Bananas', scientific: 'Musa', emoji: '🍌', branch: 'plants', what: "Giant herbs, not trees: the 'trunk' is a tight roll of leaf bases.", fact: 'Botanically, a banana is a berry.' },
  { id: 'vanilla', name: 'Vanilla', scientific: 'Vanilla planifolia', emoji: '🍦', branch: 'plants', what: 'A climbing orchid vine from Mexico whose cured seed pods give us vanilla.', fact: 'In 1841 a 12-year-old enslaved boy on Réunion, Edmond Albius, invented the quick hand-pollination method still used today.' },
  { id: 'ginkgo', name: 'Ginkgo', scientific: 'Ginkgo biloba', emoji: '🍂', branch: 'plants', what: 'The maidenhair tree, last survivor of a group older than the dinosaurs.', fact: 'Six ginkgo trees survived the Hiroshima atomic bomb within 2 km of the blast and are still alive.' },
  { id: 'welwitschia', name: 'Welwitschia', scientific: 'Welwitschia mirabilis', emoji: '🏜️', branch: 'plants', what: 'A bizarre desert plant that grows only two leaves in its entire life.', fact: 'Some Welwitschia plants are estimated to be over 1,000 years old.' },
  { id: 'horsetails', name: 'Horsetails', scientific: 'Equisetum', emoji: '🎋', branch: 'plants', what: 'Jointed, hollow-stemmed plants that look like green bottlebrushes.', fact: "Their stems are full of silica, so people once used them to scrub pots: they're also called 'scouring rush'." },
  { id: 'cacao', name: 'Cacao', scientific: 'Theobroma cacao', emoji: '🍫', branch: 'plants', what: 'A small rainforest tree whose bitter seeds become chocolate.', fact: 'The Aztecs used cacao beans as money.' },
  { id: 'peat-moss', name: 'Peat moss', scientific: 'Sphagnum', emoji: '🟫', branch: 'plants', what: 'The moss that builds bogs, soaking up water like a sponge.', fact: 'Sphagnum can hold up to about 20 times its own dry weight in water and was used as wound dressing in World War I.' },
  // ---- Fungi ----
  { id: 'truffle', name: 'Black truffle', scientific: 'Tuber melanosporum', emoji: '🐖', branch: 'fungi', what: 'An underground delicacy that grows on oak and hazel roots.', fact: 'Many truffle hunters now use dogs, because pigs tend to eat the truffles.' },
  { id: 'yeast', name: "Baker's yeast", scientific: 'Saccharomyces cerevisiae', emoji: '🍞', branch: 'fungi', what: 'A single cell that eats sugar and makes bread rise and beer fizz.', fact: 'When scientists swapped hundreds of essential yeast genes for their human versions, nearly half still kept the yeast alive.' },
  { id: 'penicillium', name: 'Penicillium', emoji: '💉', branch: 'fungi', what: 'The blue-green mould on old oranges.', fact: 'In 1928 Alexander Fleming noticed a mould killing bacteria on a dish he had left out over his holiday: penicillin.' },
  { id: 'zombie-ant-fungus', name: 'Zombie-ant fungus', scientific: 'Ophiocordyceps unilateralis', emoji: '🧟', branch: 'fungi', what: 'It takes over carpenter ants and makes them climb a plant before it sprouts from their heads.', fact: 'It inspired the zombie fungus in the video game The Last of Us.' },
  { id: 'fly-agaric', name: 'Fly agaric', scientific: 'Amanita muscaria', emoji: '🍄', branch: 'fungi', what: 'The red-capped, white-spotted toadstool from fairy tales.', fact: 'The white spots are bits of a veil that covered the young mushroom, and rain can wash them off.' },
  { id: 'honey-fungus', name: 'Honey fungus', scientific: 'Armillaria ostoyae', emoji: '🍯', branch: 'fungi', what: 'A tree-killing fungus that spreads underground with black, bootlace-like cords.', fact: 'One individual in Oregon is thought to be between 2,400 and 8,650 years old: among the largest and oldest living things on Earth.' },
];
