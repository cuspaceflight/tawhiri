open Core.Std

let fmt_err = "filename must be of format YYYYMMDDHH-UK"

let main filename () =
    if String.length filename <> 13 then raise (Invalid_argument fmt_err) else
    let date, ofday = 
        try
            let year, month, day, hour =
                Scanf.sscanf filename "%04d%02d%02d%02d" (fun a b c d -> (a, b, c, d))
            in
            Date.create_exn ~y:year ~m:(Option.value_exn (Month.of_int month)) ~d:day,
            Time.Ofday.create ~hr:hour ()
        with _ -> raise (Invalid_argument fmt_err)
    in
    let dstime = Time.of_date_ofday Time.Zone.utc date ofday in
    let dsuk = Uk.create dstime in
    let dataset = Dataset.create dstime Dataset.rw in
    Uk.copy_to_dataset dsuk dataset

let spec =
    let open Command.Spec in
    empty
    +> anon ("filename" %: string)

let command =
    Command.basic
        ~summary:"Copy a UK cutout back into a sparse dataset file"
        spec
        main

let () = Command.run command
