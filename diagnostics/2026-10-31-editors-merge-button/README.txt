Diagnostic du Conventional Comments Toolkit

report.json : le journal de la page d’options, avec la version de l’extension, le navigateur, la langue et l’état de la configuration. Chaque ligne porte l’adresse de la page relevée ; une ligne de sélecteur porte en plus un relevé de l’interface (« evidence »).

skeletons/ : le squelette de la page à l’instant où une règle de sélection n’a rien trouvé, un élément par ligne. Le champ « skeleton » d’une ligne de report.json nomme son fichier. Un squelette ne garde que la balise et une liste fermée d’attributs d’interface, sans le texte de la page — jamais la valeur d’un champ, ni le texte d’un commentaire, du code ou d’un bouton. Les valeurs de ces attributs sont conservées : un libellé d’interface (aria-label, placeholder) peut y figurer, et nommer un compte. Les squelettes les plus anciens sont effacés pour tenir dans 1 Mo : une ligne peut nommer un fichier absent.

Avant de partager cette archive, relisez report.json : les adresses nomment des dépôts et des revues, et un message d’exception peut citer ce que l’extension manipulait. Un libellé d’interface peut nommer un compte.
